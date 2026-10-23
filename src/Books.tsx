import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { bookFileUrl, listOwned, removeBookFile, removeOwned, saveOwned, updateOwned, uploadBookFile, upsertMany } from './lib/api';
import { isoToday } from './lib/planning';
import type { BookNote, BookRow, Subject } from './lib/types';
import { Title } from './ui';
import { failure } from './util';

const COLORS = ['#2b6a4b', '#d97055', '#6a5acd', '#c08a2e', '#3a7ca5', '#a5486b', '#4b8a8a'];
const SUGGEST = ['Maths', 'Physics', 'Chemistry', 'Computer Science', 'English', 'Novels'];
const STATUS: [string, string][] = [['want_to_read', 'Want to read'], ['reading', 'Reading'], ['finished', 'Finished']];
const MAX_MB = 50;

export function Books() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [books, setBooks] = useState<BookRow[]>([]);
  const [notes, setNotes] = useState<BookNote[]>([]);
  const [sel, setSel] = useState<string>('all');
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [adding, setAdding] = useState(false);
  const [newSub, setNewSub] = useState('');
  const [busy, setBusy] = useState(false);
  const [reader, setReader] = useState<{ book: BookRow; url: string } | null>(null);
  const [notesFor, setNotesFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, b, n] = await Promise.all([listOwned<Subject>('book_subjects'), listOwned<BookRow>('books'), listOwned<BookNote>('book_notes').catch(() => [] as BookNote[])]);
      setSubjects(s.sort((a, c) => a.name.localeCompare(c.name)));
      setBooks(b);
      setNotes(n);
      setMsg('');
    } catch (e) { setMsg(failure(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const count = (id: string | null) => books.filter(b => b.subject_id === id).length;
  const shown = useMemo(() => books.filter(b => {
    if (sel === 'none' ? b.subject_id : sel !== 'all' && b.subject_id !== sel) return false;
    const n = q.trim().toLowerCase();
    return !n || `${b.title} ${b.author ?? ''}`.toLowerCase().includes(n);
  }), [books, sel, q]);

  async function addSubject(name: string) {
    const n = name.trim();
    if (!n) return;
    if (subjects.some(s => s.name.toLowerCase() === n.toLowerCase())) { setMsg('That subject already exists.'); return; }
    try {
      await saveOwned('book_subjects', { name: n, color: COLORS[subjects.length % COLORS.length] });
      setNewSub('');
      await load();
    } catch (e) { setMsg(failure(e)); }
  }
  async function delSubject(s: Subject) {
    if (!window.confirm(`Delete the subject “${s.name}”? Its books stay in your library under “No subject”.`)) return;
    try { await removeOwned('book_subjects', s.id); setSel('all'); await load(); } catch (e) { setMsg(failure(e)); }
  }
  async function addBook(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const file = f.get('file') as File | null;
    if (file && file.size > MAX_MB * 1024 * 1024) { setMsg(`That file is larger than ${MAX_MB} MB.`); return; }
    setBusy(true);
    let path: string | null = null;
    try {
      if (file && file.size > 0) path = await uploadBookFile(file);
      await saveOwned('books', {
        title: String(f.get('title')).trim(), author: String(f.get('author') ?? '').trim() || null,
        subject_id: String(f.get('subject')) || null, status: 'want_to_read', pages_read: 0,
        total_pages: Number(f.get('pages')) || null,
        file_path: path, file_name: path ? file!.name : null, file_type: path ? file!.type || file!.name.split('.').pop() || null : null,
      });
      form.reset();
      setAdding(false);
      await load();
    } catch (err) {
      if (path) void removeBookFile(path).catch(() => undefined);
      setMsg(failure(err));
    } finally { setBusy(false); }
  }
  async function update(b: BookRow, patch: Partial<BookRow>) {
    try { await updateOwned('books', b.id, patch); await load(); } catch (e) { setMsg(failure(e)); }
  }
  /** Save the page you are on (bookmark) and log the pages read today. */
  async function bookmark(b: BookRow, page: number) {
    const v = Math.max(0, b.total_pages ? Math.min(b.total_pages, page) : page);
    const delta = v - (b.pages_read ?? 0);
    const status = b.total_pages && v >= b.total_pages ? 'finished' : v > 0 && b.status === 'want_to_read' ? 'reading' : b.status;
    try {
      await updateOwned('books', b.id, { pages_read: v, status });
      if (delta > 0) await upsertMany('reading_log', [{ book_id: b.id, entry_date: isoToday(), pages: delta }]).catch(() => undefined);
      await load();
    } catch (e) { setMsg(failure(e)); }
  }
  async function open(b: BookRow) {
    if (!b.file_path) return;
    try { setReader({ book: b, url: await bookFileUrl(b.file_path) }); if (b.status === 'want_to_read') void update(b, { status: 'reading' }); }
    catch (e) { setMsg(failure(e)); }
  }
  async function del(b: BookRow) {
    if (!window.confirm(`Delete “${b.title}”${b.file_path ? ' and its uploaded file' : ''}?`)) return;
    try {
      if (b.file_path) await removeBookFile(b.file_path).catch(() => undefined);
      await removeOwned('books', b.id);
      await load();
    } catch (e) { setMsg(failure(e)); }
  }

  const reading = books.filter(b => b.status === 'reading').length;
  const finished = books.filter(b => b.status === 'finished').length;
  const noteBook = books.find(b => b.id === notesFor) ?? null;

  return (
    <section>
      <Title eyebrow="Personal library" title="Your library, by subject." text="Make a section for each subject, add books, upload the file, and open it here whenever you want to read." />
      <div className="stats">
        <article className="stat"><b>{books.length}</b><span>books</span></article>
        <article className="stat"><b>{subjects.length}</b><span>subjects</span></article>
        <article className="stat"><b>{reading}</b><span>reading now</span></article>
        <article className="stat"><b>{finished}</b><span>finished</span></article>
      </div>

      <div className="subjects">
        <button className={`chip ${sel === 'all' ? 'on' : ''}`} onClick={() => setSel('all')}>All ({books.length})</button>
        {subjects.map(s => (
          <button key={s.id} className={`chip subj ${sel === s.id ? 'on' : ''}`} onClick={() => setSel(s.id)}>
            <i style={{ background: s.color }} />{s.name} ({count(s.id)})
          </button>
        ))}
        {books.some(b => !b.subject_id) && <button className={`chip ${sel === 'none' ? 'on' : ''}`} onClick={() => setSel('none')}>No subject ({count(null)})</button>}
        <form className="subj-add" onSubmit={e => { e.preventDefault(); void addSubject(newSub); }}>
          <input value={newSub} onChange={e => setNewSub(e.target.value)} placeholder="+ New subject (Maths, Physics, CS…)" />
          <button className="chip on">Add</button>
        </form>
      </div>
      {!subjects.length && (
        <div className="suggest"><small>Quick start:</small>{SUGGEST.map(s => <button key={s} className="chip" onClick={() => void addSubject(s)}>+ {s}</button>)}</div>
      )}
      {sel !== 'all' && sel !== 'none' && <button className="plain" onClick={() => { const s = subjects.find(x => x.id === sel); if (s) void delSubject(s); }}>Delete this subject</button>}

      <div className="bookbar">
        <input className="searchbar" style={{ margin: 0 }} placeholder="Search books or authors…" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn" onClick={() => setAdding(!adding)}>{adding ? 'Close' : '+ Add book'}</button>
      </div>

      {adding && (
        <form className="panel goal-form" onSubmit={addBook}>
          <h2>Add a book</h2>
          <div className="gf-row">
            <label>Subject<select name="subject" defaultValue={sel !== 'all' && sel !== 'none' ? sel : ''}><option value="">No subject</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label>Total pages (optional)<input name="pages" type="number" inputMode="numeric" min={1} /></label>
          </div>
          <input name="title" placeholder="Book name" required />
          <input name="author" placeholder="Author name" />
          <label className="filefld">Upload the book (PDF, text, image — up to {MAX_MB} MB)
            <input name="file" type="file" accept=".pdf,.txt,.md,.epub,.doc,.docx,image/*" />
          </label>
          <button className="btn" disabled={busy}>{busy ? 'Uploading…' : 'Save book'}</button>
        </form>
      )}
      {msg && <small className="error">{msg}</small>}

      <div className="grid">
        {shown.map((b, i) => {
          const s = subjects.find(x => x.id === b.subject_id);
          const read = b.pages_read ?? 0;
          const pct = b.total_pages ? Math.min(100, Math.round((read / b.total_pages) * 100)) : 0;
          const nCount = notes.filter(n => n.book_id === b.id).length;
          return (
            <article className="book" key={b.id}>
              <div className="cover" style={{ background: s?.color ?? COLORS[i % COLORS.length] }}>{b.title.slice(0, 1).toUpperCase()}</div>
              <div className="b-body">
                <div className="row"><span className="badge">{s?.name ?? 'No subject'}</span></div>
                <h3>{b.title}</h3>
                <p>{b.author || 'Author unknown'}</p>
                <select className="status" value={b.status} onChange={e => void update(b, { status: e.target.value })}>{STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                <div className="pages">
                  {b.total_pages ? <div className="meter"><i style={{ width: `${pct}%` }} /></div> : null}
                  <label>🔖 Page <input type="number" inputMode="numeric" min={0} max={b.total_pages ?? undefined} defaultValue={read} key={read} onBlur={e => { const v = Number(e.target.value) || 0; if (v !== read) void bookmark(b, v); }} />{b.total_pages ? ` / ${b.total_pages}` : ''}</label>
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  {b.file_path ? <button className="btn" onClick={() => void open(b)}>📖 Read</button> : <small className="g-hint">No file uploaded</small>}
                  <button className="chip" onClick={() => setNotesFor(b.id)}>📝 Notes ({nCount})</button>
                  <button className="plain" onClick={() => void del(b)}>Delete</button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!shown.length && <p className="empty">{books.length ? 'No books match.' : 'Your shelf is empty. Create a subject, then add your first book and upload it.'}</p>}

      {reader && <Reader book={books.find(b => b.id === reader.book.id) ?? reader.book} url={reader.url} onClose={() => setReader(null)} onBookmark={bookmark} onNotes={() => setNotesFor(reader.book.id)} />}
      {noteBook && <Notes book={noteBook} notes={notes.filter(n => n.book_id === noteBook.id)} onClose={() => setNotesFor(null)} reload={load} />}
    </section>
  );
}

function Reader({ book, url, onClose, onBookmark, onNotes }: { book: BookRow; url: string; onClose: () => void; onBookmark: (b: BookRow, page: number) => Promise<void>; onNotes: () => void }) {
  const name = (book.file_name ?? '').toLowerCase();
  const type = book.file_type ?? '';
  const isPdf = type.includes('pdf') || name.endsWith('.pdf');
  const isImg = type.startsWith('image/');
  const isText = type.startsWith('text/') || /\.(txt|md)$/.test(name);
  const [page, setPage] = useState(String(book.pages_read ?? 0));
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="reader" role="dialog" aria-label={`Reading ${book.title}`}>
      <div className="reader-bar">
        <div className="rb-title"><b>{book.title}</b><span>{book.author}</span></div>
        <label className="rb-page">🔖 <input type="number" inputMode="numeric" min={0} value={page} onChange={e => setPage(e.target.value)} aria-label="Current page" />
          <button className="chip on" onClick={() => void onBookmark(book, Number(page) || 0)}>Save</button>
        </label>
        <button className="chip" onClick={onNotes}>📝 Notes</button>
        <a className="chip" href={url} target="_blank" rel="noreferrer">New tab ↗</a>
        <button className="btn" onClick={onClose}>Close ✕</button>
      </div>
      {isPdf || isText ? <iframe title={book.title} src={url} /> : isImg ? <div className="reader-img"><img src={url} alt={book.title} /></div> : (
        <div className="reader-none"><p>This file type can’t be shown inside Daymark.</p><a className="btn" href={url} download={book.file_name ?? undefined}>Download {book.file_name}</a></div>
      )}
    </div>
  );
}

function Notes({ book, notes, onClose, reload }: { book: BookRow; notes: BookNote[]; onClose: () => void; reload: () => Promise<void> }) {
  const [err, setErr] = useState('');
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const note = String(f.get('note')).trim();
    if (!note) return;
    try {
      await saveOwned('book_notes', { book_id: book.id, page: Number(f.get('page')) || null, note });
      form.reset();
      await reload();
    } catch (error) { setErr(failure(error)); }
  }
  const sorted = [...notes].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet notes-sheet" role="dialog" aria-label={`Notes for ${book.title}`} onClick={e => e.stopPropagation()}>
        <div className="panel-head"><h2>Notes · {book.title}</h2><button className="btn ghost" onClick={onClose}>Close</button></div>
        <form className="goal-form" onSubmit={add} style={{ marginTop: 14 }}>
          <textarea name="note" placeholder="A quote, an idea, a formula, a question…" required />
          <div className="step-add"><input name="page" type="number" inputMode="numeric" min={0} placeholder="Page (optional)" style={{ maxWidth: 160 }} /><button className="btn">Save note</button></div>
        </form>
        {err && <small className="error">{err}</small>}
        <div className="note-list">
          {sorted.map(n => (
            <div className="note" key={n.id}>
              <p>{n.note}</p>
              <small>{n.page ? `Page ${n.page} · ` : ''}{new Date(n.created_at).toLocaleDateString()}</small>
              <button className="plain" onClick={() => void removeOwned('book_notes', n.id).then(reload)} aria-label="Delete note">✕</button>
            </div>
          ))}
          {!sorted.length && <p className="empty">No notes yet. Save a thought while you read.</p>}
        </div>
      </div>
    </div>
  );
}
