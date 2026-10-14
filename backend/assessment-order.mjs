// Groups retain first appearance; scores are compared only within equal missing-item sets.
export function orderAssessments(candidates){
 const groups=new Map();
 for(const candidate of candidates){const key=[...new Set(candidate.assessment.unevaluated??[])].sort().join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(candidate);}
 return [...groups.values()].flatMap(group=>group.sort((a,b)=>b.assessment.overall-a.assessment.overall));
}
