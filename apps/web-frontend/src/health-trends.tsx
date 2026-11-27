import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { healthSeries,measurementOptions,type RecordRow } from '@pharmalert/shared';
export function HealthTrends({rows}:{rows:RecordRow[]}) {
  const [selection,setSelection]=useState('weight:kg');
  const [kind,unit]=selection.split(':');
  const points=healthSeries(rows,selection);
  return <section className="card"><div className="section-heading"><div><h2>Measurement trends</h2><p>Enter a numeric measurement with its unit to show it on the chart.</p></div><select aria-label="Measurement trend" value={selection} onChange={event=>setSelection(event.target.value)}>{measurementOptions.map(([value,title])=><option key={value} value={value}>{title}</option>)}</select></div>
  {points.length?<ResponsiveContainer width="100%" height={210}><LineChart data={points}><CartesianGrid stroke="#e3eaf0" vertical={false}/><XAxis dataKey="date"/><YAxis domain={['auto','auto']}/><Tooltip/><Line name={kind==='blood pressure'?'Systolic':unit} dataKey="value" stroke="#08785e" strokeWidth={2}/>{kind==='blood pressure'&&<Line name="Diastolic" dataKey="diastolic" stroke="#2861a0" strokeWidth={2}/>}</LineChart></ResponsiveContainer>:<p className="muted">No measurements in {unit} to chart.</p>}</section>;
}
