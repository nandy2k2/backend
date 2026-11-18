const router=require('express').Router();
const mongoose=require('mongoose');
const jwt=require('jsonwebtoken');
const User=require('../Models/user');
const Menu=require('../Models/menuaccessds');
const Programs=require('../Models/mprograms');
const Workload=require('../Models/workloadassignmentds');
const {generateStructuredText}=require('./aiimagefieldextractionctlrds');
const Form=mongoose.model('facultyfeedbackformv2',new mongoose.Schema({
  colid:Number,title:String,programs:[String],semesters:[String],active:Boolean,sections:[mongoose.Schema.Types.Mixed]
},{timestamps:true}));
const Score=mongoose.model('facultyfeedbackscorev2',new mongoose.Schema({
  colid:Number,formid:String,formtitle:String,studentid:String,faculty:String,facultyemail:String,
  academicyear:String,semester:String,program:String,programcode:String,course:String,coursecode:String,
  answers:[mongoose.Schema.Types.Mixed]
},{timestamps:true}));
Score.schema.index({colid:1,formid:1,studentid:1,academicyear:1,semester:1,coursecode:1,facultyemail:1},{unique:true});
Score.schema.index({colid:1,facultyemail:1,createdAt:-1});
const text=v=>typeof v==='string'?v.trim():'';
const distinct=v=>Array.isArray(v)?[...new Set(v.map(text).filter(Boolean))]:[];
const role=v=>text(v).toLowerCase();
const wrap=(mode,fn)=>async(req,res)=>{
  let token;
  try{token=jwt.verify(text(req.get('authorization')).replace(/^Bearer\s+/i,''),process.env.JWT_SECRET);}catch{return res.sendStatus(401);}
  try{
    if(!token.user||!Number(token.colid))return res.sendStatus(401);
    const actor=await User.findOne({colid:Number(token.colid),email:token.user}).select('colid email role academicyear program programcode semester regulation').lean();
    if(!actor)return res.sendStatus(401);
    const student=role(actor.role)==='student';
    if((mode==='student')!==student)return res.sendStatus(403);
    const paths={admin:['/faculty-feedback-forms'],report:['/faculty-feedback-admin','/faculty-feedback-ranking','/faculty-feedback-courses'],grade:['/faculty-feedback-admin']};
    if(paths[mode]&&!['all','admin'].includes(role(actor.role))&&!await Menu.exists({colid:actor.colid,role:actor.role,path:{$in:paths[mode]},access:'Allow'}))return res.sendStatus(403);
    await fn(req,res,actor);
  }catch(e){res.status(e.code===11000?409:400).json({message:e.code===11000?'Feedback is already submitted for this form and course':e.message});}
};
const points=(n,max=1000)=>{if(n===''||n==null||!Number.isFinite(Number(n))||Number(n)<0||Number(n)>max)throw Error('Enter valid marks');return Number(n);};
function normalizeSections(input){
  if(!Array.isArray(input)||!input.length||input.length>20)throw Error('Add 1 to 20 sections');
  return input.map((section,i)=>{
    if(!text(section.title)||!Array.isArray(section.questions)||!section.questions.length||section.questions.length>50)throw Error('Each section needs a title and 1 to 50 questions');
    return {id:String(i),title:text(section.title).slice(0,200),questions:section.questions.map((q,j)=>{
      if(!text(q.question)||!['MCQ','Descriptive'].includes(q.type))throw Error('Enter a question and select its type');
      const max=points(q.max);
      if(!max)throw Error('Maximum marks must be greater than zero');
      const options=q.type==='MCQ'&&Array.isArray(q.options)?q.options.map(o=>({label:text(o.label).slice(0,300),score:points(o.score,max)})):[];
      if(q.type==='MCQ'&&(options.length<2||options.length>12||options.some(o=>!o.label)))throw Error('Each MCQ needs 2 to 12 labelled choices with marks');
      return {id:i+':'+j,question:text(q.question).slice(0,2500),type:q.type,max,options};
    })};
  });
}
router.get('/setup',wrap('admin',async(req,res,{colid})=>{
  const [programs,semesters,forms]=await Promise.all([Programs.find({colid}).select('program programcode').sort({program:1}).lean(),Workload.distinct('semester',{colid}),Form.find({colid}).sort({createdAt:-1}).lean()]);
  res.json({programs:[...new Map(programs.filter(row=>row.programcode).map(row=>[row.programcode,row])).values()],semesters:[...new Set([...semesters,...Array.from({length:12},(_,i)=>String(i+1))])].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),forms});
}));
router.post('/forms',wrap('admin',async(req,res,{colid})=>{
  const {id,active}=req.body;
  const title=text(req.body.title).slice(0,200),programs=distinct(req.body.programs),semesters=distinct(req.body.semesters);
  if(!title||!programs.length||!semesters.length)throw Error('Enter a title, programs and semesters');
  const codes=await Programs.distinct('programcode',{colid,programcode:{$in:programs}});
  if(codes.length!==programs.length)throw Error('Select programs from Program Master');
  const sections=normalizeSections(req.body.sections);
  const existing=id&&await Form.findOne({colid,_id:id}).lean();
  if(id&&!existing)throw Error('Form not found');
  if(existing&&await Score.exists({colid,formid:id})){
    if(JSON.stringify([title,programs,semesters,sections])!==JSON.stringify([existing.title,existing.programs,existing.semesters,existing.sections]))throw Error('Responses already exist. Create a new form to change its questions or scope.');
  }
  const payload={colid,title,programs,semesters,sections,active:active===true};
  res.json(existing?await Form.findOneAndUpdate({_id:id,colid},{$set:payload},{new:true}):await Form.create(payload));
}));
router.post('/ai',wrap('admin',async(req,res,{colid})=>{
  const {provider}=req.body,model=text(req.body.model).slice(0,160);
  if(!['Gemini','OpenAI','Claude','Ollama'].includes(provider)||!model)throw Error('Select an AI provider and model');
  const result=await generateStructuredText({colid,provider,model,prompt:'Generate teaching feedback questions. Return JSON {sections:[{title,questions:[{question,type,max,options:[{label,score}]}]}]}. Use both MCQ and Descriptive. MCQ options use score 0 to max; descriptive has no options and will be scored by staff. Produce no more than 3 sections with 5 questions each. Form: '+text(req.body.title).slice(0,200)+'\nAdditional instructions: '+text(req.body.prompt).slice(0,4000)});
  res.json(normalizeSections(result?.sections));
}));
async function studentScope(actor){
  const fields=['academicyear','programcode','semester','regulation'];
  const scope={colid:actor.colid};
  for(const field of fields)if(text(actor[field]))scope[field]=text(actor[field]);
  if(!scope.academicyear||!scope.programcode||!scope.semester)return {assignments:[],forms:[]};
  const [assignments,forms]=await Promise.all([
    Workload.find({...scope,status:{$ne:'Inactive'}}).select('academicyear semester program programcode course coursecode facultyname facultyemail').lean(),
    Form.find({colid:actor.colid,active:true,programs:scope.programcode,semesters:scope.semester}).lean()
  ]);
  return {assignments:[...new Map(assignments.filter(row=>row.facultyemail).map(row=>[JSON.stringify([row.coursecode,role(row.facultyemail)]),row])).values()],forms};
}
router.get('/student',wrap('student',async(req,res,actor)=>{
  const {assignments,forms}=await studentScope(actor);
  const completed=await Score.find({colid:actor.colid,studentid:String(actor._id),academicyear:actor.academicyear}).select('formid coursecode facultyemail semester').lean();
  res.json({assignments,completed,forms:forms.map(form=>({...form,sections:form.sections.map(section=>({...section,questions:section.questions.map(q=>({...q,options:q.options.map(o=>({label:o.label}))}))}))}))});
}));
router.post('/student',wrap('student',async(req,res,actor)=>{
  const {assignments,forms}=await studentScope(actor);
  const assignment=assignments.find(row=>String(row._id)===req.body.assignmentid);
  const form=forms.find(row=>String(row._id)===req.body.formid);
  if(!assignment||!form)throw Error('This form or teaching assignment is not available');
  const inputs=req.body.answers||{};
  const answers=form.sections.flatMap(section=>section.questions.map(q=>{
    const answer=inputs[q.id];
    if(q.type==='MCQ'&&(!Number.isInteger(answer)||!q.options[answer]))throw Error('Answer every question');
    if(q.type==='Descriptive'&&(!text(answer)||text(answer).length>5000))throw Error('Enter each descriptive response (up to 5000 characters)');
    return {sectionid:section.id,section:section.title,questionid:q.id,question:q.question,type:q.type,max:q.max,answer:q.type==='MCQ'?q.options[answer].label:text(answer),score:q.type==='MCQ'?q.options[answer].score:null};
  }));
  const {academicyear,semester,program,programcode,course,coursecode,facultyname,facultyemail}=assignment;
  await Score.create({colid:actor.colid,studentid:String(actor._id),formid:String(form._id),formtitle:form.title,academicyear,semester,program,programcode,course,coursecode,faculty:facultyname,facultyemail:role(facultyemail),answers});
  res.status(201).json({message:'Feedback submitted'});
}));
const fields=['facultyemail','academicyear','semester','program','programcode','course','coursecode','formtitle'];
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
for(const mode of ['report','mine']){
  router.get('/'+mode,wrap(mode,async(req,res,actor)=>{
    const scope={colid:actor.colid,...(mode==='mine'?{facultyemail:role(actor.email)}:{})};
    const values=await Promise.all(fields.map(async field=>[field,(await Score.distinct(field,scope)).filter(Boolean).sort()]));
    const faculties=await Score.aggregate([{$match:scope},{$group:{_id:'$facultyemail',name:{$first:'$faculty'}}},{$sort:{name:1}}]);
    res.json({values:Object.fromEntries(values),faculties});
  }));
  router.post('/'+mode,wrap(mode,async(req,res,actor)=>{
    const {from,to}=req.body;
    if((from&&!day(from))||(to&&!day(to))||(from&&to&&from>to))throw Error('Select a valid date range');
    const clauses=[];
    if(from||to)clauses.push({createdAt:{...(from?{$gte:new Date(from+'T00:00:00+05:30')}:{}),...(to?{$lt:new Date(Date.parse(to+'T00:00:00+05:30')+86400000)}:{})}});
    for(const filter of Array.isArray(req.body.filters)?req.body.filters.slice(0,20):[]){
      if(fields.includes(filter?.field)&&(mode!=='mine'||filter.field!=='facultyemail')&&text(filter.value))clauses.push({[filter.field]:text(filter.value)});
    }
    const faculty=distinct(req.body.faculty).slice(0,100);
    if(mode==='report'&&faculty.length)clauses.push({facultyemail:{$in:faculty}});
    const filter={colid:actor.colid,...(mode==='mine'?{facultyemail:role(actor.email)}:{}),...(clauses.length?{$and:clauses}:{})};
    const rows=await Score.find(filter).select('-studentid'+(mode==='mine'?' -answers.answer':'')).sort({createdAt:-1}).lean();
    res.json(rows);
  }));
}
router.post('/grade',wrap('grade',async(req,res,{colid})=>{
  const row=await Score.findOne({colid,_id:req.body.id}).lean();
  const question=row?.answers.find(q=>q.questionid===req.body.questionid&&q.type==='Descriptive');
  if(!question)throw Error('Descriptive answer not found');
  await Score.updateOne({colid,_id:row._id,'answers.questionid':question.questionid},{$set:{'answers.$.score':points(req.body.score,question.max)}});
  res.json({message:'Score saved'});
}));
module.exports=router;
