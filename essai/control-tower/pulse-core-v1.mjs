const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,Number(n)||0));

export function computePulse(previous={},observed={}){
  const samples=Number(previous.samples||0);
  const priorTotal=Number.isFinite(Number(previous.totalEvents))?Number(previous.totalEvents):null;
  const totalEvents=Number(observed.totalEvents||0);
  const observedDelta=priorTotal===null?0:totalEvents-priorTotal;
  const trend=Number(previous.trend||0);
  const predictedDelta=samples?Math.round(trend):0;
  const previousHead=String(previous.headSha||'');
  const headSha=String(observed.headSha||'');
  const headChanged=!!(previousHead&&headSha&&previousHead!==headSha);
  const priorChangeProb=clamp(previous.changeProbability??0.25);
  const predictedChange=priorChangeProb>=0.5;
  const deltaResidual=observedDelta-predictedDelta;
  const changeMiss=samples>0&&predictedChange!==headChanged;
  const residualScore=Math.abs(deltaResidual)+(changeMiss?2:0);
  const maturity=Math.min(1,samples/6);
  const fit=1-Math.min(1,residualScore/Math.max(3,Math.abs(observedDelta)+Math.abs(predictedDelta)+2));
  const confidence=clamp((0.35+0.65*maturity)*fit);
  const nextTrend=Number((trend*0.65+observedDelta*0.35).toFixed(3));
  const nextChangeProbability=Number(clamp(priorChangeProb*0.7+(headChanged?1:0)*0.3).toFixed(3));
  const mature=samples>=3;
  const mode=residualScore>=6?'FULL_SYNC_RECOMMENDED':residualScore>=2||(mature&&confidence<0.45)?'WIDE':'MICRO';
  const sampleSize=mode==='MICRO'?4:mode==='WIDE'?12:48;
  return {
    schema:'GVAULT_CONTROL_TOWER_PULSE_STATE_V1',
    samples:samples+1,
    totalEvents,
    headSha:headSha||previousHead||'',
    trend:nextTrend,
    changeProbability:nextChangeProbability,
    prediction:{eventDelta:predictedDelta,changeExpected:predictedChange,confidence:Number(confidence.toFixed(3))},
    observation:{eventDelta:observedDelta,headChanged,newestAt:observed.newestAt||null,engines:Array.isArray(observed.engines)?observed.engines:[]},
    difference:{deltaResidual,changeMiss,residualScore},
    mode,
    sampleSize,
    at:new Date().toISOString()
  };
}

export const PULSE_CORE_V1=Object.freeze({schema:'GVAULT_CONTROL_TOWER_PULSE_CORE_V1'});
