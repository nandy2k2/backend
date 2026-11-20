const Roll=require('../Models/conductexamrollds');
const Submission=require('../Models/conductexamformsubmissionds');
const Ledger=require('../Models/ledgerstud');
function paymentStatus(rows,waived){
  if(waived)return 'Waived';
  if(!rows.length)return 'Unlinked';
  const paid=rows.reduce((sum,row)=>sum+Number(row.paid||0),0);
  if(rows.every(row=>row.balance!=null&&Number(row.balance)<=0))return paid>0?'Paid':'Waived';
  return paid>0?'Partially Paid':'Unpaid';
}
async function reconcile(filter){
  const rolls=await Roll.find(filter).lean();
  let matched=0;
  for(const roll of rolls){
    const submissions=await Submission.find({colid:roll.colid,regno:roll.regno,academicyear:roll.academicyear,examcode:roll.examcode,'courses.coursecode':roll.coursecode}).sort({createdAt:-1,_id:-1}).lean();
    let selected;
    for(const submission of submissions){
      const course=submission.courses.find(row=>row.coursecode===roll.coursecode);
      if(course?.programcode&&course.programcode!==roll.programcode)continue;
      if(course?.semester&&String(course.semester)!==String(roll.semester))continue;
      const prefix=String(submission._id)+'-';
      const fees=await Ledger.find({colid:roll.colid,regno:roll.regno,academicyear:submission.academicyear,feeid:{$regex:'^'+prefix},feecategory:/^exam fee$/i}).lean();
      const rows=fees.filter(row=>row.feeid===prefix+submission.examtype+'-ExamFeeTotal'||row.feeid===prefix+submission.examtype+'-'+roll.coursecode);
      const status=paymentStatus(rows,!Number(submission.totalfee)&&submission.totalfee!=null);
      const candidate={submissionid:String(submission._id),ledgerfeeid:rows.map(row=>row.feeid).join(', '),paymentstatus:status};
      if(!selected)selected=candidate;
      if(status==='Paid'||status==='Waived'){selected=candidate;break;}
    }
    if(!selected)selected={submissionid:'',ledgerfeeid:'',paymentstatus:'Unlinked'};
    if(selected.paymentstatus!=='Unlinked')matched++;
    await Roll.updateOne({_id:roll._id,colid:roll.colid},{$set:selected});
  }
  return {processed:rolls.length,matched,unlinked:rolls.length-matched};
}
async function ledgerChanged(row){
 if(!row||!row.colid||!row.regno||!row.feeid||!/^[a-f\d]{24}-/i.test(row.feeid))return;
 await reconcile({colid:row.colid,regno:row.regno,...(row.academicyear?{academicyear:row.academicyear}:{})});
}
module.exports={reconcile,ledgerChanged,paymentStatus};
