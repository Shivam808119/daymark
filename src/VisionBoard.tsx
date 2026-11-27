import { PointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import { listOwned, saveOwned } from './lib/api';
import { supabase } from './lib/supabase';
import { failure } from './util';
import { loadScheduleHistory, type DayRecord } from './Schedule';

export function VisionBoard({ date }: { date: string }) {
  const [record, setRecord] = useState<DayRecord | null>(null);
  const [note, setNote] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [tool, setTool] = useState<'pen' | 'eraser' | 'move'>('pen');
  const [ink, setInk] = useState('#133d31');
  const canvas = useRef<HTMLCanvasElement>(null);
  const activePointer = useRef<number | null>(null);
  const load = useCallback(async () => {
    const rows = await loadScheduleHistory();
    const row = rows.find(x => x.entry_date === date) ?? null;
    setRecord(row);
    setNote(row?.board_note ?? '');
  }, [date]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let alive = true;
    setImageUrl('');
    if (!supabase || !record?.board_path) return;
    void supabase.storage.from('vision-boards').createSignedUrl(record.board_path, 3600).then(({ data }) => {
      if (alive && data?.signedUrl) setImageUrl(data.signedUrl);
    });
    return () => { alive = false; };
  }, [record?.board_path]);
  async function save(patch: { board_note?: string; board_path?: string | null }) {
    try {
      const current = (await listOwned<DayRecord>('schedule_days')).find(row => row.entry_date === date) ?? record;
      const next = { board_note: note, board_path: current?.board_path ?? null, ...patch };
      await saveOwned('schedule_days', { entry_date: date, mode: current?.mode ?? 'home', completed: current?.completed ?? [], targets: current?.targets ?? [], ...next }, 'user_id,entry_date');
      setRecord({ entry_date: date, mode: current?.mode ?? 'home', completed: current?.completed ?? [], targets: current?.targets ?? [], board_note: next.board_note, board_path: next.board_path });
      setMessage('Saved ✓');
    } catch (err) { setMessage(failure(err)); }
  }
  async function upload(file?: File) {
    if (!file || !supabase) return;
    if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) { setMessage('Choose an image of 8 MB or less.'); return; }
    setUploading(true); setMessage('');
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Please sign in first.');
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${user.user.id}/${date}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('vision-boards').upload(path, file, { contentType: file.type });
      if (error) throw error;
      await save({ board_path: path });
      setMessage('Image saved to your private vision board.');
    } catch (err) { setMessage(failure(err)); }
    finally { setUploading(false); }
  }
  function draw(e: PointerEvent<HTMLCanvasElement>, action: 'down' | 'move' | 'up') {
    const target = canvas.current;
    if (!target) return;
    if (action === 'up') {
      if (activePointer.current === e.pointerId) activePointer.current = null;
      return;
    }
    if (tool === 'move') return;
    if (action === 'down' && (activePointer.current !== null || (e.pointerType === 'mouse' && e.button !== 0))) return;
    if (action === 'move' && activePointer.current !== e.pointerId) return;
    e.preventDefault();
    const context = target.getContext('2d'); if (!context) return;
    const rect = target.getBoundingClientRect();
    const x = (e.clientX - rect.left) * target.width / rect.width;
    const y = (e.clientY - rect.top) * target.height / rect.height;
    context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    context.strokeStyle = tool === 'eraser' ? '#000000' : ink; context.lineWidth = tool === 'eraser' ? 24 : 4; context.lineCap = 'round'; context.lineJoin = 'round';
    if (action === 'down') { activePointer.current = e.pointerId; target.setPointerCapture(e.pointerId); context.beginPath(); context.moveTo(x, y); context.lineTo(x + .01, y + .01); context.stroke(); }
    else { context.lineTo(x, y); context.stroke(); }
  }
  async function saveDrawing() {
    if (!canvas.current) return;
    const blob = await new Promise<Blob | null>(resolve => canvas.current?.toBlob(resolve, 'image/png'));
    if (blob) await upload(new File([blob], 'my-drawing.png', { type: 'image/png' }));
  }
  async function removeImage() {
    if (record?.board_path && supabase) {
      const { error } = await supabase.storage.from('vision-boards').remove([record.board_path]);
      if (error) { setMessage(error.message); return; }
    }
    await save({ board_path: null });
    setImageUrl('');
  }
  return <section className="panel vision-after-reflection">
    <div className="vision-after-head"><div><p className="kicker">OPTIONAL · YOUR CREATIVE SPACE</p><h2>Save a moment from today.</h2><p>Keep a sketch, photo, visual idea or a few words. Skip it whenever you want.</p></div><span className="vision-head-symbol">✳</span></div>
    <div className="vision-options">
      <label className="vision-action"><span>↥</span><strong>{uploading ? 'Uploading…' : 'Upload an image'}</strong><small>A drawing, screenshot or photo</small><input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={e => void upload(e.target.files?.[0])}/></label>
      <button className="vision-action" onClick={() => setDrawingOpen(x => !x)}><span>✎</span><strong>{drawingOpen ? 'Close drawing pad' : 'Draw here'}</strong><small>Sketch something on the page</small></button>
    </div>
    {drawingOpen && <div className="vision-drawing"><div className="drawing-toolbar" role="toolbar" aria-label="Drawing tools"><div className="drawing-tools" aria-label="Choose a tool"><button type="button" className={tool === 'pen' ? 'selected' : ''} aria-pressed={tool === 'pen'} onClick={() => setTool('pen')}>✎ Pen</button><button type="button" className={tool === 'eraser' ? 'selected' : ''} aria-pressed={tool === 'eraser'} onClick={() => setTool('eraser')}>◒ Eraser</button><button type="button" className={tool === 'move' ? 'selected' : ''} aria-pressed={tool === 'move'} onClick={() => setTool('move')}>↖ Move</button></div><div className="drawing-colors" aria-label="Pen colors">{[['#133d31', 'Forest'], ['#17212a', 'Black'], ['#2869bd', 'Blue'], ['#cb523b', 'Coral'], ['#8a57b5', 'Purple']].map(([color, label]) => <button key={color} type="button" className={`drawing-color ${ink === color ? 'selected' : ''}`} style={{ backgroundColor: color }} aria-label={`${label} ink`} aria-pressed={ink === color} onClick={() => { setInk(color); setTool('pen'); }}/>)}</div></div><p className="drawing-hint">{tool === 'move' ? 'Move or scroll without drawing.' : 'Touch the canvas with your pen or press the mouse to draw. Lift to stop.'}</p><canvas ref={canvas} width={900} height={390} style={{ touchAction: tool === 'move' ? 'pan-y' : 'none', cursor: tool === 'move' ? 'default' : tool === 'eraser' ? 'cell' : 'crosshair' }} onPointerDown={e => draw(e, 'down')} onPointerMove={e => draw(e, 'move')} onPointerUp={e => draw(e, 'up')} onPointerCancel={e => draw(e, 'up')} onLostPointerCapture={e => draw(e, 'up')} aria-label="Drawing pad"/><div className="vision-drawing-actions"><button className="chip" onClick={() => { const context = canvas.current?.getContext('2d'); if (context && canvas.current) context.clearRect(0, 0, canvas.current.width, canvas.current.height); }}>Clear drawing</button><button className="btn" onClick={() => void saveDrawing()} disabled={uploading}>Save drawing</button></div></div>}
    {imageUrl && <div className="vision-saved"><img src={imageUrl} alt="Your saved drawing or vision image"/><button className="chip" onClick={() => void removeImage()}>Remove image</button></div>}
    <label className="vision-explain">Add an explanation (optional)<textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="What did you draw, imagine or want to remember?"/></label>
    <div className="vision-save-bottom"><span role="status">{message}</span><button className="btn" onClick={() => void save({ board_note: note })}>Save my note</button></div>
  </section>;
}
