const jwt = require('jsonwebtoken');
const Projects = require('../Models/projects');
const Publications = require('../Models/publications');
const Seminars = require('../Models/seminar');
const Patents = require('../Models/patents');
const Ledger = require('../Models/projectledger');

exports.summary = async (req,res) => {
  let identity;
  try { identity=jwt.verify(String(req.get('authorization')||'').replace(/^Bearer\s+/i,''),process.env.JWT_SECRET); }
  catch { return res.status(401).json({message:'Sign in to view faculty research'}); }
  if(!identity.user||!Number(identity.colid))return res.status(401).json({message:'Faculty identity unavailable'});
  const email=new RegExp('^'+String(identity.user).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$','i');
  const scope={colid:Number(identity.colid),user:email};
  try{
    const [projects,publications,seminars,patents,ledger]=await Promise.all([
      Projects.find(scope).select('project agency type yop funds duration status1').lean(),
      Publications.find(scope).select('title journal yop issn citation status1').lean(),
      Seminars.find(scope).select('title type yop duration role amount status1').lean(),
      Patents.find(scope).select('title patentnumber agency doa yop patentstatus status1').lean(),
      Ledger.find({colid:scope.colid,$or:[{user:email},{faculty:email}]}).select('project year amountreceived amountspent').lean()
    ]);
    res.json({projects,publications,seminars,patents,ledger});
  }catch(error){res.status(500).json({message:'Unable to load faculty research records'});}
};
