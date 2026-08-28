import {useEffect,useMemo,useState} from 'react';
import ReactECharts from 'echarts-for-react';
import type { Visual } from '../types';
import { formatForField } from '../formatting';

function CategoryNavigator({total,visible,start,onChange}:{total:number;visible:number;start:number;onChange:(start:number)=>void}){
  const maxStart=Math.max(0,total-visible);
  if(!maxStart)return null;
  const current=Math.max(0,Math.min(maxStart,start));
  return <div className="chartCategoryNavigator" onMouseDown={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()}>
    <button type="button" aria-label="Previous categories" disabled={current===0} onClick={()=>onChange(current-1)}>‹</button>
    <input aria-label="Chart category scrollbar" type="range" min="0" max={maxStart} step="1" value={current} onChange={e=>onChange(+e.target.value)}/>
    <button type="button" aria-label="Next categories" disabled={current===maxStart} onClick={()=>onChange(current+1)}>›</button>
    <span>{current+1}–{Math.min(total,current+visible)} of {total}</span>
  </div>;
}

function ChartShell({children,total,visible,start,onChange}:{children:any;total:number;visible:number;start:number;onChange:(start:number)=>void}){
  return <div className="chartWithNavigator"><div className="chartCanvas">{children}</div><CategoryNavigator total={total} visible={visible} start={start} onChange={onChange}/></div>;
}


function PremiumDataTable({rows,formats,matrix=false}:{rows:any[];formats:any;matrix?:boolean}){
  const[search,setSearch]=useState('');const[page,setPage]=useState(0);const[sort,setSort]=useState<{field:string,dir:'asc'|'desc'}|null>(null);const pageSize=20;
  const columns=rows.length?Object.keys(rows[0]):[];
  const filtered=useMemo(()=>{const q=search.trim().toLowerCase();let data=!q?rows:rows.filter(r=>columns.some(c=>String(r[c]??'').toLowerCase().includes(q)));if(sort){data=[...data].sort((a,b)=>{const av=a[sort.field],bv=b[sort.field];const cmp=typeof av==='number'&&typeof bv==='number'?av-bv:String(av??'').localeCompare(String(bv??''));return sort.dir==='asc'?cmp:-cmp})}return data},[rows,search,sort]);
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const current=Math.min(page,pages-1);const visible=filtered.slice(current*pageSize,(current+1)*pageSize);
  const numericMax:Record<string,number>={};for(const c of columns){numericMax[c]=Math.max(...filtered.map(r=>typeof r[c]==='number'?Math.abs(r[c]):0),1)}
  return <div className={'premiumDataTable '+(matrix?'matrixMode':'')}>
    <div className="premiumTableToolbar"><div className="premiumTableSearch">⌕<input value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}} placeholder="Search rows…"/></div><span>{filtered.length.toLocaleString()} rows</span></div>
    <div className="tableWrap premiumTable"><table><thead><tr>{columns.map(c=><th key={c} onClick={()=>setSort(s=>s?.field===c?{field:c,dir:s.dir==='asc'?'desc':'asc'}:{field:c,dir:'asc'})}>{c}<span>{sort?.field===c?(sort.dir==='asc'?' ↑':' ↓'):''}</span></th>)}</tr></thead><tbody>{visible.map((row,ri)=><tr key={ri}>{columns.map((c,ci)=>{const numeric=typeof row[c]==='number';const pct=numeric?Math.min(100,Math.abs(row[c])/numericMax[c]*100):0;const hasFormat=!!formats?.[c];return <td key={c} className={matrix&&ci===0?'matrixRowHeader':''} style={numeric?{backgroundImage:`linear-gradient(90deg, rgba(37,99,235,.08) ${pct}%, transparent ${pct}%)`}:undefined}>{numeric||hasFormat?formatForField(row[c],c,formats):String(row[c]??'')}</td>})}</tr>)}</tbody></table></div>
    <div className="premiumTablePager"><button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={current===0}>Previous</button><span>Page {current+1} of {pages}</span><button onClick={()=>setPage(p=>Math.min(pages-1,p+1))} disabled={current>=pages-1}>Next</button></div>
  </div>
}

function PremiumMatrix({rows,visual,formats}:{rows:any[];visual:Visual;formats:any}){
  const rowFields=visual.bindings.axis||[];
  const columnField=visual.bindings.legend?.[0];
  const valueFields=visual.bindings.values||[];
  const columnValues=columnField?Array.from(new Set(rows.map(r=>String(r[columnField]??'')))):[];
  const grouped=useMemo(()=>{
    const map=new Map<string,any>();
    for(const row of rows){
      const key=rowFields.map(f=>String(row[f]??'')).join('\u001f');
      if(!map.has(key))map.set(key,{key,labels:rowFields.map(f=>row[f]),rows:[]});
      map.get(key).rows.push(row);
    }
    return Array.from(map.values());
  },[rows,rowFields.join('|')]);
  const aggregate=(items:any[],field:string)=>{const nums=items.map(r=>Number(r[field])).filter(Number.isFinite);return nums.length?nums.reduce((a,b)=>a+b,0):items[0]?.[field]};
  return <div className="premiumDataTable matrixMode">
    <div className="premiumTableToolbar"><b>Matrix hierarchy</b><span>{grouped.length.toLocaleString()} row groups</span></div>
    <div className="tableWrap premiumTable matrixTable"><table><thead>
      <tr>{rowFields.map(f=><th key={f} rowSpan={columnField?2:1}>{f}</th>)}{columnField?columnValues.map(c=><th key={c} colSpan={Math.max(1,valueFields.length)} className="matrixColumnGroup">{c}</th>):valueFields.map(v=><th key={v}>{v}</th>)}</tr>
      {columnField&&<tr>{columnValues.flatMap(c=>valueFields.map(v=><th key={`${c}:${v}`}>{v}</th>))}</tr>}
    </thead><tbody>{grouped.map((group:any,ri:number)=><tr key={group.key}>{rowFields.map((f,i)=><td key={f} className="matrixRowHeader"><span style={{paddingLeft:i*14}}>{i>0?'↳ ':''}{String(group.labels[i]??'')}</span></td>)}{columnField?columnValues.flatMap(c=>valueFields.map(v=>{const matching=group.rows.filter((r:any)=>String(r[columnField]??'')===c);return <td key={`${c}:${v}`}>{matching.length?formatForField(aggregate(matching,v),v,formats):'—'}</td>})):valueFields.map(v=><td key={v}>{formatForField(aggregate(group.rows,v),v,formats)}</td>)}</tr>)}</tbody>
    <tfoot><tr><th colSpan={Math.max(1,rowFields.length)}>Total</th>{columnField?columnValues.flatMap(c=>valueFields.map(v=><th key={`${c}:${v}`}>{formatForField(aggregate(rows.filter(r=>String(r[columnField]??'')===c),v),v,formats)}</th>)):valueFields.map(v=><th key={v}>{formatForField(aggregate(rows,v),v,formats)}</th>)}</tr></tfoot>
    </table></div>
  </div>;
}

export default function Chart({ visual, rows, onPointClick }: { visual: Visual; rows: any[]; onPointClick?:(field:string,value:any)=>void }) {
  const [categoryStart,setCategoryStart]=useState(0);
  const axis = (visual.bindings.axis || []).slice(-1)[0];
  const valueField = visual.bindings.values?.[0];
  useEffect(()=>setCategoryStart(0),[visual.id,visual.format.visibleCategoryCount,rows.length]);
  const targetField = visual.bindings.target?.[0];
  const legendField=visual.bindings.legend?.[0];
  const accent = visual.format.accent || '#22d3ee';
  const formats = visual.format.fieldFormats || {};
  const fmt = (value: any, field = valueField) => formatForField(value, field, formats);
  const labelColor = visual.format.labelColor || '#dce8f5';
  const labelSize = visual.format.labelFontSize || 11;
  const axisColor=visual.format.axisColor||'#8497ae';
  const axisSize=visual.format.axisFontSize||10;
  const lineWidth=visual.format.lineWidth||3;
  const smooth=visual.format.smoothLines!==false;
  const marker=visual.format.markerShape||'circle';
  const chartOpacity=Math.max(.2,Math.min(1,(visual.format.chartOpacity??100)/100));
  const fontFamily=`${visual.format.fontFamily||'Aptos'}, 'Segoe UI Variable', 'Segoe UI', sans-serif`;
  const gridLineColor=visual.format.gridLineColor||'#e2e8f0';
  const gridLineStyle=visual.format.gridLineStyle||'dashed';
  const axisTitleStyle={color:axisColor,fontSize:axisSize,fontFamily,fontWeight:600};
  const referenceMarkLine=(horizontal=false)=>visual.format.referenceLineEnabled?{symbol:'none',silent:true,lineStyle:{color:visual.format.referenceLineColor||'#d13438',type:'dashed',width:2},label:{show:true,formatter:visual.format.referenceLineLabel||'Reference',color:visual.format.referenceLineColor||'#d13438',fontSize:10},data:[horizontal?{xAxis:visual.format.referenceLineValue??0}:{yAxis:visual.format.referenceLineValue??0}]}:undefined;
  const categoryZoom=(categories:any[],horizontal=false)=>{
    const visible=Math.max(3,Math.min(100,visual.format.visibleCategoryCount||12));
    const startValue=Math.max(0,Math.min(Math.max(0,categories.length-visible),categoryStart));
    const endValue=Math.min(categories.length-1,startValue+visible-1);
    return[
      {type:'inside',startValue,endValue,
        xAxisIndex:horizontal?undefined:0,yAxisIndex:horizontal?0:undefined,
        zoomLock:true,moveOnMouseWheel:false,moveOnMouseMove:false}
    ];
  };
  const tooltipBase:any={show:visual.format.tooltipEnabled!==false,backgroundColor:visual.format.tooltipBackground||'#ffffff',borderColor:visual.format.tooltipColor||'#242424',borderWidth:1,textStyle:{color:visual.format.tooltipColor||'#242424',fontFamily,fontSize:12},extraCssText:'box-shadow:0 6px 18px rgba(0,0,0,.16);border-radius:3px;'};
  const allValueFields=visual.bindings.values||[];
  const premiumPalette=['#2563eb','#10b981','#8b5cf6','#f59e0b','#0ea5e9','#ef4444','#14b8a6','#f97316','#6366f1','#22c55e'];
  // ECharts must receive the pointer event without the designer selecting and
  // re-rendering the visual mid-drag; clicks still keep their existing slicer action.
  const chartEvents:Record<string,Function>|undefined=axis&&onPointClick?{mousedown:(p:any)=>p?.event?.event?.stopPropagation?.(),datazoom:(p:any)=>{const z=p?.batch?.[0]||p;const next=Number.isFinite(z?.startValue)?z.startValue:Math.round((Number(z?.start)||0)/100*Math.max(0,rows.length-1));setCategoryStart(x=>x===next?x:next)},click:(p:any)=>{const value=p?.name!==undefined&&p?.name!==''?p.name:rows[p?.dataIndex||0]?.[axis];if(value!==undefined)onPointClick(axis,value)}}:undefined;
  // Formatting updates must be reflected immediately. Remount the ECharts instance when
  // renderer-relevant formatting changes so stale tooltip/axis/legend state cannot survive.
  const formatRefreshKey=JSON.stringify({
    tooltipEnabled:visual.format.tooltipEnabled,tooltipBackground:visual.format.tooltipBackground,tooltipColor:visual.format.tooltipColor,
    legendVisible:visual.format.legendVisible,legendPosition:visual.format.legendPosition,legendColor:visual.format.legendColor,legendFontSize:visual.format.legendFontSize,
    axisFontSize:visual.format.axisFontSize,axisColor:visual.format.axisColor,axisTitleVisible:visual.format.axisTitleVisible,xAxisTitle:visual.format.xAxisTitle,yAxisTitle:visual.format.yAxisTitle,
    gridLines:visual.format.gridLines,gridLineColor:visual.format.gridLineColor,gridLineStyle:visual.format.gridLineStyle,
    markerShape:visual.format.markerShape,lineWidth:visual.format.lineWidth,smoothLines:visual.format.smoothLines,barRadius:visual.format.barRadius,barWidth:visual.format.barWidth,chartOpacity:visual.format.chartOpacity,
    referenceLineEnabled:visual.format.referenceLineEnabled,referenceLineValue:visual.format.referenceLineValue,referenceLineLabel:visual.format.referenceLineLabel,referenceLineColor:visual.format.referenceLineColor,
    zoomSlider:visual.format.zoomSlider,visibleCategoryCount:visual.format.visibleCategoryCount,accent:visual.format.accent,dataLabels:visual.format.dataLabels,showDataPoints:visual.format.showDataPoints,dataPointSize:visual.format.dataPointSize
  });


  const legendVisible = visual.format.legendVisible !== false;
  const legendPosition = visual.format.legendPosition || 'bottom';
  const legend: any = {
    show: legendVisible,
    textStyle: { color: visual.format.legendColor||axisColor, fontSize: visual.format.legendFontSize||11,fontFamily }
  };
  if (legendPosition === 'top') Object.assign(legend, { top: 0, left: 'center' });
  if (legendPosition === 'bottom') Object.assign(legend, { bottom: 0, left: 'center' });
  if (legendPosition === 'left') Object.assign(legend, { left: 0, top: 'middle', orient: 'vertical' });
  if (legendPosition === 'right') Object.assign(legend, { right: 0, top: 'middle', orient: 'vertical' });

  if (visual.type === 'kpi') {
    const seriesValues=rows.map(r=>Number(r?.[valueField||''])).filter(Number.isFinite);
    const current=seriesValues.length?seriesValues[seriesValues.length-1]:Number(rows?.[0]?.[valueField||'']);
    const explicitTarget=targetField?Number(rows?.[rows.length-1]?.[targetField]):Number.NaN;
    const previous=seriesValues.length>1?seriesValues[seriesValues.length-2]:Number.NaN;
    const compare=Number.isFinite(explicitTarget)?explicitTarget:previous;
    const diff=Number.isFinite(current)&&Number.isFinite(compare)?current-compare:Number.NaN;
    const pct=Number.isFinite(diff)&&compare!==0?diff/Math.abs(compare)*100:Number.NaN;
    const favorable=visual.format.favorableDirection||'up';
    const good=Number.isFinite(diff)&&((favorable==='up'&&diff>0)||(favorable==='down'&&diff<0));
    const bad=Number.isFinite(diff)&&((favorable==='up'&&diff<0)||(favorable==='down'&&diff>0));
    const indicatorColor=good?(visual.format.positiveColor||'#16a34a'):bad?(visual.format.negativeColor||'#dc2626'):(visual.format.neutralColor||'#64748b');
    const arrow=Number.isFinite(diff)?(diff>0?'↑':diff<0?'↓':'→'):'';
    const spark=seriesValues.slice(-18);
    const min=Math.min(...spark,0),max=Math.max(...spark,1),range=max-min||1;
    const points=spark.map((v,i)=>`${spark.length===1?50:(i/(spark.length-1))*100},${34-((v-min)/range)*26}`).join(' ');
    const metricLabel=valueField||'Metric';
    const icon=(metricLabel.match(/sales|revenue|amount|cost|profit|price/i)?'₹':metricLabel.match(/customer|employee|user|people/i)?'●':metricLabel.match(/order|invoice|ticket|case/i)?'▣':'◆');
    return <div className="premiumKpiCard">
      <div className="premiumKpiTop"><span className="premiumKpiIcon" style={{background:`${accent}16`,color:accent}}>{icon}</span><div><small>{metricLabel}</small>{visual.format.subtitleVisible&&visual.format.subtitle&&<span>{visual.format.subtitle}</span>}</div></div>
      <div className="premiumKpiMain"><b style={{fontSize:visual.format.fontSize||38,color:visual.format.titleColor||'#0f172a'}}>{fmt(current)}</b>{arrow&&<div className="premiumKpiDelta" style={{color:indicatorColor}}><strong>{arrow}{Number.isFinite(pct)?` ${Math.abs(pct).toFixed(1)}%`:''}</strong><span>{targetField?`vs ${targetField}`:'vs previous'}</span></div>}</div>
      {spark.length>1&&<div className="premiumSparkline"><svg viewBox="0 0 100 38" preserveAspectRatio="none"><polyline points={points} fill="none" stroke={accent} strokeWidth="2.6" vectorEffect="non-scaling-stroke"/><polyline points={`0,38 ${points} 100,38`} fill={`${accent}10`} stroke="none"/></svg></div>}
    </div>;
  }

  if (visual.type === 'card') {
    const current=rows?.[0]?.[valueField||''];
    return <div className="advancedCardVisual">
      <div className="advancedCardValue" style={{color:visual.format.labelColor||'#242424',fontFamily,fontSize:visual.format.fontSize||28}}>{fmt(current)}</div>
      <div className="advancedCardLabel">{valueField||'Value'}</div>
    </div>;
  }

  if (visual.type === 'multirowcard') {
    const row=rows?.[0]||{};
    const fields=allValueFields.length?allValueFields:Object.keys(row).slice(0,6);
    const tilePalette=['#2563eb','#10b981','#8b5cf6','#f59e0b','#0ea5e9','#ef4444','#14b8a6','#6366f1'];
    const iconFor=(field:string)=>field.match(/sales|revenue|amount|price|cost|profit/i)?'₹':field.match(/customer|employee|user|people/i)?'●':field.match(/product|item|sku/i)?'◆':field.match(/order|invoice|ticket|case/i)?'▣':'#';
    const niceValue=(field:string,value:any)=>{const n=Number(value);if(Number.isFinite(n)&&Number.isInteger(n)&&field.match(/customer|product|order|count|quantity/i))return n.toLocaleString();return formatForField(value,field,formats)};
    return <div className="multiCardGrid premiumMultiCardGrid">{fields.slice(0,8).map((field,i)=>{const c=tilePalette[i%tilePalette.length];return <div className="multiCardItem premiumMultiCardItem" key={field} style={{'--metric-color':c} as any}><span className="premiumMultiIcon" style={{background:`${c}14`,color:c}}>{iconFor(field)}</span><div><span className="premiumMultiLabel">{field.replace(/^.*\./,'').replace(/_/g,' ')}</span><b>{niceValue(field,row[field])}</b><small>Current value</small></div></div>})}</div>;
  }

  if (visual.type === 'progress') {
    const current=Number(rows?.[0]?.[valueField||'']||0);
    const target=targetField?Number(rows?.[0]?.[targetField]||0):Math.max(current,100);
    const pct=target?Math.max(0,Math.min(100,current/target*100)):0;
    return <div className="progressVisual"><div className="progressMetric"><b style={{color:accent}}>{fmt(current)}</b><span>{targetField?`of ${fmt(target,targetField)}`:`${pct.toFixed(1)}%`}</span></div><div className="progressTrack"><i style={{width:`${pct}%`,background:accent}}/></div><small>{valueField||'Progress'}</small></div>;
  }

  if (visual.type === 'matrix') return <PremiumMatrix rows={rows} visual={visual} formats={formats}/>;

  if (visual.type === 'table') return <PremiumDataTable rows={rows} formats={formats}/>;

  // For pie/donut the category field is placed in bindings.legend (not axis).
  // Fall back to legendField so every chart type works regardless of which pane was used.
  const effectiveAxis = axis || legendField;
  const names = rows.map((row) => row[effectiveAxis || '']);
  const values = rows.map((row) => row[valueField || '']);
  const tooltipFormatter = (params: any) => {
    const entries = Array.isArray(params) ? params : [params];
    const first = entries[0];
    const dataIndex = first?.dataIndex ?? 0;
    const row = rows[dataIndex] || {};
    const main = entries.map((p: any) => `${p.marker || ''}${p.name}<br/><b>${fmt(p.value)}</b>`).join('<br/>');
    const extras=(visual.bindings.tooltips||[]).map((field)=>`${field}: <b>${formatForField(row[field],field,formats)}</b>`).join('<br/>');
    return extras ? `${main}<br/>${extras}` : main;
  };


  if (visual.type === 'treemap') {
    return <ReactECharts key={formatRefreshKey} notMerge={true} style={{height:'100%'}} onEvents={chartEvents} option={{
      tooltip:{...tooltipBase,formatter:(p:any)=>`${p.name}<br/><b>${fmt(p.value)}</b>`},
      series:[{type:'treemap',roam:false,nodeClick:false,breadcrumb:{show:false},label:{show:true,color:labelColor,fontFamily,fontSize:labelSize,formatter:(p:any)=>`${p.name}\n${fmt(p.value)}`},
        upperLabel:{show:false},itemStyle:{borderColor:'#ffffff',borderWidth:2,gapWidth:2},data:rows.map(r=>({name:String(r[effectiveAxis||'']),value:Number(r[valueField||'']||0)}))}]
    }}/>;
  }

  if (visual.type === 'funnel') {
    return <ReactECharts key={formatRefreshKey} notMerge={true} style={{height:'100%'}} onEvents={chartEvents} option={{
      tooltip:{...tooltipBase,trigger:'item',formatter:tooltipFormatter},series:[{type:'funnel',left:'8%',top:12,bottom:12,width:'84%',sort:'descending',gap:3,
        label:{show:visual.format.dataLabels!==false,color:labelColor,fontFamily,fontSize:labelSize,formatter:(p:any)=>`${p.name}  ${fmt(p.value)}`},
        itemStyle:{borderColor:'#ffffff',borderWidth:1,opacity:chartOpacity},
        data:rows.map(r=>({name:String(r[effectiveAxis||'']),value:Number(r[valueField||'']||0)}))}]
    }}/>;
  }

  if (visual.type === 'waterfall') {
    const nums=values.map(v=>Number(v)||0);let running=0;
    const helpers=nums.map(v=>{const start=running;running+=v;return start});
    return <ReactECharts key={formatRefreshKey} notMerge={true} style={{height:'100%'}} onEvents={chartEvents} option={{
      tooltip:{...tooltipBase,trigger:'axis',formatter:tooltipFormatter},grid:{left:58,right:20,top:16,bottom:75},dataZoom:categoryZoom(names),
      xAxis:{type:'category',data:names,axisLabel:{color:axisColor,fontSize:axisSize,fontFamily}},
      yAxis:{type:'value',axisLabel:{color:axisColor,fontSize:axisSize,formatter:(x:number)=>fmt(x)},splitLine:{show:visual.format.gridLines!==false,lineStyle:{color:gridLineColor,type:gridLineStyle}}},
      series:[
        {type:'bar',stack:'wf',silent:true,itemStyle:{color:'transparent'},data:helpers},
        {type:'bar',stack:'wf',barMaxWidth:visual.format.barWidth||38,data:nums.map(v=>({value:Math.abs(v),itemStyle:{color:v>=0?(visual.format.positiveColor||'#34d399'):(visual.format.negativeColor||'#fb7185')}})),
         label:{show:visual.format.dataLabels,color:labelColor,position:'top',formatter:(p:any)=>fmt(nums[p.dataIndex])},markLine:referenceMarkLine(false)}
      ]
    }}/>;
  }

  if (visual.type === 'radar') {
    // Render radar geometry directly. This keeps the visual stable even when a
    // report has sparse categories; ECharts' radar coordinator can throw while
    // mounting malformed/small indicator sets and take down the whole designer.
    const radarNames=names.slice(0,12).map(n=>String(n??''));
    const radarValues=values.slice(0,12).map(v=>Number(v)||0);
    const count=Math.max(3,radarNames.length);
    while(radarNames.length<count)radarNames.push('');
    while(radarValues.length<count)radarValues.push(0);
    const cx=160,cy=94,radius=62,max=Math.max(...radarValues.map(v=>Math.abs(v)),1)*1.1;
    const point=(i:number,r:number)=>{const a=-Math.PI/2+i*Math.PI*2/count;return [cx+Math.cos(a)*r,cy+Math.sin(a)*r] as const};
    const polygon=(r:number)=>Array.from({length:count},(_,i)=>point(i,r).join(',')).join(' ');
    const dataPoints=radarValues.map((v,i)=>point(i,Math.max(0,Math.min(1,Math.abs(v)/max))*radius).join(',')).join(' ');
    return <div style={{height:'100%',width:'100%',display:'grid',placeItems:'center'}}>
      <svg viewBox="0 0 320 205" role="img" aria-label={`${valueField||'Value'} radar chart`} style={{width:'100%',height:'100%',overflow:'visible',fontFamily}}>
        {[.25,.5,.75,1].map(level=><polygon key={level} points={polygon(radius*level)} fill={level%1===0?'#f8fafc':'none'} stroke={gridLineColor} strokeWidth="1"/>) }
        {Array.from({length:count},(_,i)=>{const[x,y]=point(i,radius);return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={gridLineColor} strokeWidth="1"/>})}
        <polygon points={dataPoints} fill={`${accent}2d`} stroke={accent} strokeWidth={lineWidth} strokeLinejoin="round"/>
        {radarValues.map((v,i)=>{const[x,y]=point(i,Math.max(0,Math.min(1,Math.abs(v)/max))*radius);return <circle key={i} cx={x} cy={y} r={Math.max(2,visual.format.dataPointSize||4)} fill="#fff" stroke={accent} strokeWidth="2"><title>{radarNames[i]}: {fmt(v)}</title></circle>})}
        {radarNames.map((name,i)=>{const[x,y]=point(i,radius+17),anchor=x<cx-8?'end':x>cx+8?'start':'middle';return <text key={i} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" fill={axisColor} fontSize={axisSize}>{name}</text>})}
        <text x={cx} y="198" textAnchor="middle" fill={axisColor} fontSize="10" fontWeight="600">{valueField||'Value'}</text>
      </svg>
    </div>;
  }

  if (visual.type === 'heatmap') {
    const max=Math.max(...values.map(v=>Number(v)||0),1);
    return <ReactECharts key={formatRefreshKey} notMerge={true} style={{height:'100%'}} onEvents={chartEvents} option={{
      tooltip:{...tooltipBase,position:'top'},grid:{left:100,right:20,top:18,bottom:42},
      xAxis:{type:'category',data:names,axisLabel:{color:axisColor,fontSize:axisSize,rotate:names.length>12?45:0}},
      yAxis:{type:'category',data:[valueField||'Value'],axisLabel:{color:axisColor}},
      visualMap:{min:0,max,calculable:false,orient:'horizontal',left:'center',bottom:0,inRange:{color:['#10283b',accent]}},
      series:[{type:'heatmap',data:values.map((v,i)=>[i,0,Number(v)||0]),label:{show:visual.format.dataLabels,color:labelColor,formatter:(p:any)=>fmt(p.value[2])},itemStyle:{borderColor:'#ffffff',borderWidth:2}}]
    }}/>;
  }

  if (visual.type === 'histogram') {
    const nums=values.map(v=>Number(v)).filter(Number.isFinite);
    const bins=Math.max(5,Math.min(20,Math.round(Math.sqrt(nums.length||1))));
    const min=Math.min(...nums,0),max=Math.max(...nums,1),step=(max-min||1)/bins;
    const counts=Array(bins).fill(0);nums.forEach(v=>counts[Math.min(bins-1,Math.floor((v-min)/step))]++);
    const labels=counts.map((_,i)=>`${(min+i*step).toFixed(1)}–${(min+(i+1)*step).toFixed(1)}`);
    return <ReactECharts key={formatRefreshKey} notMerge={true} style={{height:'100%'}} onEvents={chartEvents} option={{
      tooltip:{...tooltipBase,trigger:'axis'},grid:{left:48,right:18,top:14,bottom:58},xAxis:{type:'category',data:labels,axisLabel:{color:axisColor,fontSize:8,rotate:40}},
      yAxis:{type:'value',axisLabel:{color:axisColor,fontSize:axisSize},splitLine:{show:visual.format.gridLines!==false,lineStyle:{color:gridLineColor,type:gridLineStyle}}},
      series:[{type:'bar',data:counts,barGap:'0%',barCategoryGap:'3%',barMaxWidth:visual.format.barWidth||42,itemStyle:{color:accent,opacity:chartOpacity,borderRadius:[visual.format.barRadius||4,visual.format.barRadius||4,0,0]},markLine:referenceMarkLine(false)}]
    }}/>;
  }

  if (visual.type === 'boxplot') {
    const nums=values.map(v=>Number(v)).filter(Number.isFinite).sort((a,b)=>a-b);
    const q=(p:number)=>nums.length?nums[Math.min(nums.length-1,Math.floor((nums.length-1)*p))]:0;
    const data=[[q(0),q(.25),q(.5),q(.75),q(1)]];
    return <ReactECharts key={formatRefreshKey} notMerge={true} style={{height:'100%'}} onEvents={chartEvents} option={{
      tooltip:{...tooltipBase,trigger:'item'},grid:{left:55,right:20,top:20,bottom:42},xAxis:{type:'category',data:[valueField||'Distribution'],axisLabel:{color:axisColor,fontSize:axisSize}},yAxis:{type:'value',axisLabel:{color:axisColor,fontSize:axisSize,formatter:(x:number)=>fmt(x)},splitLine:{show:visual.format.gridLines!==false,lineStyle:{color:gridLineColor,type:gridLineStyle}}},
      series:[{type:'boxplot',data,itemStyle:{color:`${accent}55`,borderColor:accent,borderWidth:lineWidth},markLine:referenceMarkLine(false)}]
    }}/>;
  }

  if (visual.type === 'bubble') {
    const second=allValueFields[1];const secondVals=second?rows.map(r=>Number(r[second])||0):values.map((v,i)=>i+1);
    const max2=Math.max(...secondVals.map(Math.abs),1);
    return <ReactECharts key={formatRefreshKey} notMerge={true} style={{height:'100%'}} onEvents={chartEvents} option={{
      tooltip:{...tooltipBase,trigger:'item',formatter:(p:any)=>`${p.name}<br/>${valueField}: <b>${fmt(p.value[1])}</b>${second?`<br/>${second}: ${formatForField(p.value[2],second,formats)}`:''}`},
      grid:{left:55,right:25,top:18,bottom:42},xAxis:{type:'category',data:names,axisLabel:{color:axisColor,fontSize:axisSize}},yAxis:{type:'value',axisLabel:{color:axisColor,formatter:(x:number)=>fmt(x)},splitLine:{show:visual.format.gridLines!==false,lineStyle:{color:gridLineColor,type:gridLineStyle}}},
      series:[{type:'scatter',data:values.map((v,i)=>[names[i],Number(v)||0,secondVals[i]]),symbol:marker,symbolSize:(d:any)=>10+Math.abs(d[2])/max2*35,itemStyle:{color:accent,opacity:chartOpacity},markLine:referenceMarkLine(false)}]
    }}/>;
  }

  if (visual.type === 'combo') {
    const second=allValueFields[1];const secondData=second?rows.map(r=>r[second]):values;
    return <ReactECharts key={formatRefreshKey} notMerge={true} style={{height:'100%'}} onEvents={chartEvents} option={{
      tooltip:{...tooltipBase,trigger:'axis'},legend:{...legend,data:[valueField,second].filter(Boolean)},grid:{left:58,right:54,top:22,bottom:75},dataZoom:categoryZoom(names),
      xAxis:{type:'category',data:names,axisLabel:{color:axisColor,fontSize:axisSize}},
      yAxis:[{type:'value',axisLabel:{color:axisColor,formatter:(x:number)=>fmt(x,valueField)}},{type:'value',axisLabel:{color:axisColor,formatter:(x:number)=>formatForField(x,second,formats)}}],
      series:[{name:valueField,type:'bar',data:values,barMaxWidth:visual.format.barWidth||34,itemStyle:{color:accent,opacity:chartOpacity,borderRadius:[visual.format.barRadius||5,visual.format.barRadius||5,0,0]},markLine:referenceMarkLine(false)},
       {name:second||valueField,type:'line',yAxisIndex:1,data:secondData,smooth,lineStyle:{color:visual.format.positiveColor||'#34d399',width:lineWidth},symbol:marker,symbolSize:visual.format.dataPointSize||7}]
    }}/>;
  }

  if (visual.type === 'donut' || visual.type === 'pie') {
    const total=values.reduce((a:any,b:any)=>Number(a||0)+Number(b||0),0);
    const autoLegend=rows.length<=6?(legendPosition||'bottom'):'right';
    const premiumLegend:any={show:legendVisible,textStyle:{color:visual.format.legendColor||axisColor,fontSize:visual.format.legendFontSize||11,fontWeight:600,fontFamily},itemWidth:12,itemHeight:12,itemGap:14};
    if(autoLegend==='right')Object.assign(premiumLegend,{right:12,top:'middle',orient:'vertical'});
    else if(autoLegend==='left')Object.assign(premiumLegend,{left:12,top:'middle',orient:'vertical'});
    else if(autoLegend==='top')Object.assign(premiumLegend,{top:0,left:'center'});
    else Object.assign(premiumLegend,{bottom:0,left:'center'});
    const center:any=(autoLegend==='right'?['42%','46%']:autoLegend==='left'?['58%','46%']:['50%','43%']);
    return (
      <ReactECharts key={formatRefreshKey} notMerge={true}
        style={{ height: '100%' }}
        onEvents={chartEvents}
        option={{
          animationDuration: 750,
          animationEasing:'cubicOut',
          color:[accent,...premiumPalette.filter(c=>c.toLowerCase()!==accent.toLowerCase())],
          tooltip: {
            ...tooltipBase,
            trigger: 'item',
            padding:[10,12],
            formatter: (p: any) => {
              const row=rows[p.dataIndex]||{};
              const extras=(visual.bindings.tooltips||[]).map((field)=>`${field}: <b>${formatForField(row[field],field,formats)}</b>`).join('<br/>');
              return `<b>${p.name}</b><br/>${p.marker}${fmt(p.value)} &nbsp; <span style="color:#94a3b8">${p.percent}%</span>${extras?'<br/>'+extras:''}`;
            }
          },
          legend:premiumLegend,
          graphic: visual.type==='donut'&&values.length?[{type:'text',left:center[0],top:'38%',style:{text:fmt(total),fill:'#0f172a',fontSize:24,fontWeight:800,textAlign:'center'},z:10},{type:'text',left:center[0],top:'50%',style:{text:(valueField||'Total').replace(/^.*\./,''),fill:'#64748b',fontSize:10,fontWeight:600,textAlign:'center'},z:10}]:[],
          series: [
            {
              type: 'pie',
              radius: visual.type === 'donut' ? ['43%', '68%'] : '64%',
              center,
              minAngle:2,
              avoidLabelOverlap:true,
              data: rows.map((row) => ({name: row[axis || legendField || ''],value: row[valueField || '']})),
              itemStyle: { borderColor: '#ffffff', borderWidth: 3,borderRadius:5,shadowBlur:4,shadowColor:'rgba(15,23,42,.08)' },
              emphasis:{scale:true,scaleSize:8,itemStyle:{shadowBlur:18,shadowColor:'rgba(15,23,42,.22)'}},
              labelLine:{show:rows.length<=8,length:13,length2:10,lineStyle:{width:1.4}},
              label: {
                show: rows.length<=8 ? true : visual.format.dataLabels,
                color: '#334155',
                fontSize: Math.max(11,labelSize),
                lineHeight:15,
                formatter: (p: any) => `{name|${p.name}}\n{value|${fmt(p.value)} (${p.percent}%)} `,
                rich:{name:{fontWeight:700,color:'#334155',fontSize:11},value:{fontWeight:600,color:'#64748b',fontSize:10}}
              }
            }
          ]
        }}
      />
    );
  }

  if (visual.type === 'gauge') {
    const numberValue = Number(values[0] || 0);
    const maximum = Math.max(Math.abs(numberValue) * 1.25, 100);
    return (
      <ReactECharts key={formatRefreshKey} notMerge={true}
        style={{ height: '100%' }}
        onEvents={chartEvents}
        option={{
          series: [
            {
              type: 'gauge',
              max: maximum,
              progress: { show: true, width: 13 },
              axisLine: {
                lineStyle: {
                  width: 13,
                  color: [[1, '#1f3147']]
                }
              },
               axisLabel: { show:false },
              axisTick: { show: false },
              splitLine: { show: false },
              pointer: { width: 4 },
              detail: {
                valueAnimation: true,
                 color: visual.format.labelColor||'#0f172a',
                 fontSize: Math.max(18,visual.format.fontSize||20),
                 offsetCenter:[0,'55%'],
                formatter: (x: number) => fmt(x)
              },
              data: [{ value: numberValue, name: valueField || '' }],
              itemStyle: { color: accent },
               title: { color: visual.format.labelColor||'#64748b', fontSize: 10,offsetCenter:[0,'78%'] }
            }
          ]
        }}
      />
    );
  }

  if (visual.type === 'scatter') {
    return (
      <ReactECharts key={formatRefreshKey} notMerge={true}
        style={{ height: '100%' }}
        onEvents={chartEvents}
        option={{
          tooltip: { ...tooltipBase, trigger: 'item', formatter: tooltipFormatter },
          grid: { left: 54, right: 20, top: 18, bottom: 44 },
          xAxis: {
            type: 'category',
            data: names,
            axisLabel: { color: axisColor,fontSize:axisSize,fontFamily }
          },
          yAxis: {
            type: 'value',
            axisLabel: {
              color: axisColor,fontSize:axisSize,fontFamily,
              formatter: (x: number) => fmt(x)
            },
            splitLine: {
              show: visual.format.gridLines !== false,
              lineStyle: { color: gridLineColor,type:gridLineStyle }
            }
          },
          series: [
            {
              type: 'scatter',
              data: values,
              symbolSize: visual.format.dataPointSize || 10,
              itemStyle: {
                color: accent,
                shadowBlur: 8,
                shadowColor: `${accent}55`,opacity:chartOpacity
              },
              label: {
                show: visual.format.dataLabels,
                color: labelColor,
                fontSize: labelSize,
                formatter: (p: any) => fmt(p.value)
              },markLine:referenceMarkLine(false)
            }
          ]
        }}
      />
    );
  }


  if (legendField && ['bar','column','stackedbar','stackedcolumn','line','area'].includes(visual.type)) {
    const categories=Array.from(new Set(rows.map(r=>String(r[axis||'']))));
    const seriesNames=Array.from(new Set(rows.map(r=>String(r[legendField]))));
    const palette=[accent,...premiumPalette.filter(c=>c.toLowerCase()!==accent.toLowerCase())];
    const horizontal=visual.type==='bar'||visual.type==='stackedbar';
    const categoryAxis:any={type:'category',data:categories,name:visual.format.axisTitleVisible?((horizontal?visual.format.yAxisTitle:visual.format.xAxisTitle)||axis||'Category'):'',nameTextStyle:axisTitleStyle,nameLocation:'middle',nameGap:38,axisLabel:{color:axisColor,fontSize:axisSize,fontFamily},axisTick:{show:false,lineStyle:{color:axisColor}},axisLine:{lineStyle:{color:axisColor}}};
    const valueAxis:any={type:'value',name:visual.format.axisTitleVisible?((horizontal?visual.format.xAxisTitle:visual.format.yAxisTitle)||valueField||'Value'):'',nameTextStyle:axisTitleStyle,nameLocation:'middle',nameGap:52,axisLabel:{color:axisColor,fontSize:axisSize,fontFamily,formatter:(x:number)=>fmt(x)},splitLine:{show:visual.format.gridLines!==false,lineStyle:{color:gridLineColor,type:gridLineStyle}}};
    const isLine=visual.type==='line'||visual.type==='area';
    const stacked=visual.type==='stackedbar'||visual.type==='stackedcolumn';
    return <ReactECharts key={formatRefreshKey} notMerge={true} style={{height:'100%'}} onEvents={chartEvents} option={{
      animationDuration:650,color:palette,legend:{...legend,data:seriesNames},
      tooltip:{...tooltipBase,trigger:'axis',formatter:tooltipFormatter},
      grid:{left:horizontal?100:58,right:horizontal?42:24,top:28,bottom:horizontal?58:75},
      toolbox: { show: false },
      dataZoom:categoryZoom(categories,horizontal),
      xAxis:horizontal?valueAxis:categoryAxis,yAxis:horizontal?categoryAxis:valueAxis,
      series:seriesNames.map((sn,si)=>({
        name:sn,type:isLine?'line':'bar',stack:stacked?'total':undefined,smooth,
        data:categories.map(cat=>{const row=rows.find(r=>String(r[axis||''])===cat&&String(r[legendField])===sn);return Number(row?.[valueField||'']||0)}),
        itemStyle:{color:palette[si%palette.length],opacity:chartOpacity,borderRadius:!isLine?(stacked?4:[visual.format.barRadius||8,visual.format.barRadius||8,visual.format.barRadius||8,visual.format.barRadius||8]):0},
        emphasis:{focus:'series',itemStyle:{shadowBlur:10,shadowColor:`${palette[si%palette.length]}55`}},
        lineStyle:{color:palette[si%palette.length],width:lineWidth},areaStyle:visual.type==='area'?{opacity:.12}:undefined,markLine:si===0?referenceMarkLine(horizontal):undefined,
        symbol:marker,symbolSize:visual.format.dataPointSize||7,barMaxWidth:visual.format.barWidth||42,
        label:{show:stacked&&categories.length<=10?true:visual.format.dataLabels,color:stacked?'#ffffff':labelColor,fontWeight:700,fontSize:Math.max(10,labelSize),position:stacked?'inside':horizontal?'right':'top',formatter:(p:any)=>fmt(p.value)}
      }))
    }}/>;
  }

  const horizontal =
    visual.type === 'bar' || visual.type === 'stackedbar';

  const categoryAxis: any = {
    type: 'category',
    data: names,
    name:visual.format.axisTitleVisible?((horizontal?visual.format.yAxisTitle:visual.format.xAxisTitle)||axis||'Category'):'',
    nameTextStyle:axisTitleStyle,
    nameLocation:'middle',nameGap:38,
    axisLabel: { color: axisColor, fontSize: axisSize, fontFamily },
    axisLine: { lineStyle: { color: axisColor } },
    axisTick: { show: false, lineStyle: { color: axisColor } }
  };

  const valueAxis: any = {
    type: 'value',
    name:visual.format.axisTitleVisible?((horizontal?visual.format.xAxisTitle:visual.format.yAxisTitle)||valueField||'Value'):'',
    nameTextStyle:axisTitleStyle,
    nameLocation:'middle',nameGap:52,
    axisLabel: {
      color: axisColor,
      fontSize: axisSize,
      fontFamily,
      formatter: (x: number) => fmt(x)
    },
    axisLine: { show: false },
    splitLine: {
      show: visual.format.gridLines !== false,
      lineStyle: { color: gridLineColor, type: gridLineStyle }
    }
  };

  const base: any = {
    animationDuration: 650,
    color:premiumPalette,
    textStyle: { color: '#334155' },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      formatter: tooltipFormatter
    },
    grid: { left: horizontal ? 100 : 58, right: horizontal ? 42 : 24, top: 20, bottom: horizontal ? 54 : 75 },
    toolbox: { show: false },
    dataZoom:categoryZoom(names,horizontal),
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series: []
  };

  const chartType =
    visual.type === 'line' || visual.type === 'area' ? 'line' : 'bar';
  const showPoints = visual.format.showDataPoints !== false;

  base.series = [
    {
      type: chartType,
      data: values,
      smooth,
      barMaxWidth: visual.format.barWidth || 38,
      areaStyle: visual.type === 'area' ? { opacity: 0.18 } : undefined,
      itemStyle: {
        color: accent,
        borderRadius: chartType === 'bar' ? (horizontal?[0,visual.format.barRadius||9,visual.format.barRadius||9,0]:[visual.format.barRadius||9,visual.format.barRadius||9,0,0]) : 0,
        opacity: chartOpacity,
        shadowBlur:chartType==='bar'?4:0,
        shadowColor:chartType==='bar'?`${accent}28`:'transparent'
      },
      emphasis:{focus:'series',itemStyle:{shadowBlur:14,shadowColor:`${accent}44`}},
      lineStyle: { color: accent, width: lineWidth },
      markLine:referenceMarkLine(horizontal),
      symbol: showPoints ? marker : 'none',
      showSymbol: showPoints,
      symbolSize: visual.format.dataPointSize || 7,
      label: {
        show: visual.format.dataLabels,
        color: labelColor,
        fontSize: labelSize,
        position: horizontal
          ? 'right'
          : visual.format.labelPosition === 'inside'
            ? 'inside'
            : 'top',
        formatter: (p: any) => fmt(p.value)
      },
      stack: (visual.type === 'stackedbar'||visual.type==='stackedcolumn') ? 'total' : undefined
    }
  ];

  return <ChartShell total={names.length} visible={Math.max(3,Math.min(100,visual.format.visibleCategoryCount||12))} start={categoryStart} onChange={setCategoryStart}><ReactECharts key={formatRefreshKey} notMerge={true} style={{ height: '100%' }} onEvents={chartEvents} option={base} /></ChartShell>;
}
