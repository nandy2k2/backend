const {Lead} = require('../Models/crm2ds');
const {Assignment} = require('../Models/crm2programds');
const Rate = require('../Models/crm2partnerpaymentds');
const round = value => Math.round((Number(value) + Number.EPSILON)*100)/100;
function summarize(leads, assignments, rates) {
  const leadIds = new Set(leads.filter(row=>row.admitted==='Yes').map(row=>String(row._id))), seen = new Set(), converted = new Set(), programs = new Map();
  for(const row of assignments) {
    if(!leadIds.has(String(row.leadid)) || row.admitted !== 'Yes') continue;
    const key=`${row.academicyear}|${row.programcode}`, unique=`${row.leadid}|${key}`;
    if(seen.has(unique)) continue; seen.add(unique);
    converted.add(String(row.leadid));
    const program=programs.get(key) || {id:key,academicyear:row.academicyear,program:row.program,programcode:row.programcode,admitted:0};
    program.admitted++;programs.set(key,program);
  }
  const rows=[...programs.values()].map(row=>{
    const rate=rates.find(item=>item.academicyear===row.academicyear && item.programcode===row.programcode);
    return {...row,rate:rate?Number(rate.amount):null,amount:rate?round(row.admitted*Number(rate.amount)):0,rateStatus:rate?'Configured':'Not configured'};
  }).sort((a,b)=>a.program.localeCompare(b.program));
  const admitted=leads.filter(row=>row.admitted==='Yes').length;
  return {programs:rows,summary:{totalLeads:leads.length,admitted,unallocatedAdmissions:Math.max(0,admitted-converted.size),conversionPercentage:leads.length?round(admitted/leads.length*100):0,totalPayment:round(rows.reduce((sum,row)=>sum+row.amount,0)),unconfiguredAdmissions:rows.filter(row=>row.rate===null).reduce((sum,row)=>sum+row.admitted,0)}};
}
async function report({colid,kind,email,academicyear,partnerid}) {
  const owner=kind==='publisher'?'publisheremail':'agentemail';
  const match={colid,[owner]:new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`,'i')};
  const owned=await Lead.find(match).select('-password -emailkey -phonekey -interactions -documents -education').sort({createdAt:-1}).lean();
  const assignments=await Assignment.find({colid,leadid:{$in:owned.map(row=>row._id)},...(academicyear?{academicyear}:{}),admitted:'Yes'}).select('leadid academicyear program programcode admitted').lean();
  const assigned=new Set(assignments.map(row=>String(row.leadid)));
  // An admitted program's year can differ from the original lead profile year.
  const leads=owned.filter(row=>!academicyear || row.academicyear===academicyear || row.programsinterested?.some(item=>item.academicyear===academicyear) || assigned.has(String(row._id)));
  const rates=partnerid?await Rate.find({colid,kind,partnerid,...(academicyear?{academicyear}:{})}).lean():[];
  const result=summarize(leads,assignments,rates);
  const byLead=new Map();
  for(const row of assignments) byLead.set(String(row.leadid),[...(byLead.get(String(row.leadid)) || []),`${row.program} (${row.programcode})`]);
  return {...result,leads:leads.map(row=>({...row,admittedPrograms:(byLead.get(String(row._id)) || []).join(', ')}))};
}
module.exports={report,summarize};
