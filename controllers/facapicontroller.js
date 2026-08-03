const { promisify } = require('util');
const jwt=require('jsonwebtoken');
const User=require('./../Models/user');
const Class=require('./../Models/class');
const Attend=require('./../Models/attendance');
const Classenr=require('./../Models/classenr');
const Cfiles=require('./../Models/coursefiles');
const Examenr=require('./../Models/examenr');
const Questions=require('./../Models/questions');
const Answers=require('./../Models/answers');
const Exam=require('./../Models/exam');
const Finalanswer=require('./../Models/finalanswer');
const Addonc=require('./../Models/addonc');
const Vacclass=require('./../Models/vacclass');
const Vacattendance=require('./../Models/vacattendance');
const Vacenroll=require('./../Models/vacclassenr');
const Workload=require('./../Models/workload');
const Period=require('./../Models/period');
const Feedback=require('./../Models/feedback');
const Assignment=require('./../Models/assignment');
const Coursefiles=require('./../Models/coursefiles');
const Assignsubmit=require('./../Models/assignsubmit');
const Libbooks=require('./../Models/libbooks');
const Libassign=require('./../Models/libassign');
const Seminar=require('./../Models/seminar');
const Projects=require('./../Models/projects');
const Publication=require('./../Models/publications');
const Patents=require('./../Models/patents');
const Book=require('./../Models/book');
const Cocal=require('./../Models/cocal');
const Employer=require('./../Models/employerfeedback');
const Parent=require('./../Models/parentfeedback');
const Alumni=require('./../Models/alumnifeedback');
const Mou=require('./../Models/mou');
const Kpi=require('./../Models/kpi');
const Meeting=require('./../Models/meeting');
const nodemailer=require('nodemailer');
const Mlink=require('./../Models/mlink');
const htmltotext=require('html-to-text');
const Department=require('./../Models/department');
const Awsconfig=require('./../Models/awsconfig');
const Circularfac=require('./../Models/circularfac');
const Institutions=require('./../Models/institutions');
const Supportingdoc=require('./../Models/supportingdoc');
const Taskassign=require('./../Models/taskassign');
const Metricrules=require('./../Models/metricrules');
const Explearning=require('./../Models/explearning');
const Employability=require('./../Models/employability');
const Accrcomments=require('./../Models/accrcomments');
const Syllabusrev=require('./../Models/syllabusrev');
const Higheredu=require('./../Models/higheredu');
const Higherexam=require('./../Models/higherexam');
const Qspeer=require('./../Models/qspeers');
const Qsemployers=require('./../Models/qsemployers');
const Project = require('./../Models/projects');
const Patent = require('./../Models/patents');
const Consultancy=require('./../Models/consultancy');
//const Employability=require('./../Models/employability');
//const Explearning=require('./../Models/explearning');

const Deptfeedback=require('./../Models/deptfeedback');



exports.getworkload= async (req,res) => {
    try{
        const user1=req.query.user;
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            // const decoded=await promisify(jwt.decode)(token, process.env.JWT_SECRET);
            // console.log(decoded);
            // console.log(decoded.colid + '-' + decoded.user);
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
              //console.log(verified);
    
        } catch(err1234) {
            //console.log(err1234);
        }
        //console.log(jwtuser + '-' + jwtcolid);

        
        const lcat1233= await Workload.find()
            .where('user')
            .equals(user1);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.loginapi= async (req,res) => {
    try{
        const authenticator = require('./authenticatorctlrds');

        const email=req.query.email;
        const password=req.query.password;

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(200).json({ message: "User not found", status: "Not found" });
        }

        if (user.password !== password) {
            return res.status(200).json({ message: "Incorrect password", status: "Incorrect password" });
        }

        // const { colid, name, email: userEmail, regno, role, user: username } = user;
        const token=jwt.sign({ user: email, colid: String([user.colid]) }, process.env.JWT_SECRET, {
                    expiresIn: process.env.JWT_EXPIRES_IN
                });

        return res.status(200).json({ 
            status:'Success',
            colid: user.colid, 
            name:user.name, 
            user: user.email, 
            regno:user.regno, 
            role:user.role,
            semester:user.semester,
            programcode:user.programcode,
            section:user.section,
            semester:user.semester,
            lastlogin:user.lastlogin,
            category:user.category,
            department:user.department,
            statuslog:user.status,
            token:token,
            googleemail:user.googleemail,
            designation:user.designation,
            twofa: authenticator.statusForUser(user)
        });
        
    } catch(err) {
        console.log(err);
        res.status(201).json({

            status:'Error ' + err,
        });

    }  
};

exports.loginapif= async (req,res) => {
    try{
        const authenticator = require('./authenticatorctlrds');

        const email=req.query.email;
        // const password=req.query.password;

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(200).json({ status: "User not found" });
        } 

        // if (user.password !== password) {
        //     return res.status(401).json({ message: "Incorrect password" });
        // }

        // const { colid, name, email: userEmail, regno, role, user: username } = user;
        const token=jwt.sign({ user: email, colid: String([user.colid]) }, process.env.JWT_SECRET, {
                    expiresIn: process.env.JWT_EXPIRES_IN
                });

        return res.status(200).json({ 
            status:'Success',
            colid: user.colid, 
            name:user.name, 
            user: user.email, 
            regno:user.regno, 
            role:user.role,
            semester:user.semester,
            programcode:user.programcode,
            section:user.section,
            semester:user.semester,
            lastlogin:user.lastlogin,
            category:user.category,
            department:user.department,
            statuslog:user.status,
            token:token,
            password:user.password,
            department:user.department,
            googleemail:user.googleemail,
            designation:user.designation,
            twofa: authenticator.statusForUser(user)
        });
        
    } catch(err) {
        console.log(err);
        res.status(201).json({

            status:'Error ' + err,
        });

    }  
};

// exports.loginapi= async (req,res) => {
//     try{

//         const email=req.query.email;
//         const password=req.query.password;
//         User.findOne({ email: email, password: password  }, (err, role) => {
//             // User.findOne({ email: email  }, (err, role) => {
//             // if (err) {
//             //     res.status(201).json({
//             //         status:'Error'
//             //     });
//             // }
//             if(role) {
//                 // res.cookie("user",String([role.email]));
//                 // res.cookie("name",String([role.name]));
//                 // res.cookie("department",String([role.department]));
//                 // res.cookie("colid",String([role.colid]));
//                 // res.cookie("role",String([role.role]));
//                 const token=jwt.sign({ user: email, colid: String([role.colid]) }, process.env.JWT_SECRET, {
//                     expiresIn: process.env.JWT_EXPIRES_IN
//                 });
//                 return res.status(200).json({
//                     status:'Success',
//                     user: String([role.email]),
//                     role: String([role.role]),
//                     name: String([role.name]),
//                     colid: String([role.colid]),
//                     regno: String([role.regno]),
//                     section: String([role.section]),
//                     semester: String([role.semester]),
//                     department: String([role.department]),
//                     programcode: String([role.programcode]),
//                     statuslog: String([role.status]),
//                     status1: String([role.status1]),
//                     lastlogin: String([role.lastlogin]),
//                     category: String([role.category]),
//                     token: token
//                 });
//             } else {
//                 return res.status(201).json({
//                     status:'Invalid username or password',
//                 });
//             }
//           });
//     } catch(err) {
//         console.log(err);
//         res.status(201).json({

//             status:'Error ' + err,
//         });

//     }  
// };

exports.loginapinew= async (req,res) => {
    try{

        const email=req.query.email;
        const password=req.query.password;
         User.findOne({ email: email, password: password  }, (err, role) => {
            //User.findOne({ email: email  }, (err, role) => {
            // if (err) {
            //     res.status(201).json({
            //         status:'Error'
            //     });
            // }
            if(role) {
                // res.cookie("user",String([role.email]));
                // res.cookie("name",String([role.name]));
                // res.cookie("department",String([role.department]));
                // res.cookie("colid",String([role.colid]));
                // res.cookie("role",String([role.role]));
                const token=jwt.sign({ user: email, colid: String([role.colid]) }, process.env.JWT_SECRET, {
                    expiresIn: process.env.JWT_EXPIRES_IN
                });
                return res.status(200).json({
                    status:'Success',
                    user: String([role.email]),
                    role: String([role.role]),
                    name: String([role.name]),
                    colid: String([role.colid]),
                    regno: String([role.regno]),
                    section: String([role.section]),
                    semester: String([role.semester]),
                    department: String([role.department]),
                    programcode: String([role.programcode]),
                    statuslog: String([role.status]),
                    token: token
                });
            } else {
                return res.status(201).json({
                    status:'Invalid username or password',
                });
            }
          });
    } catch(err) {
        // res.status(201).json({
        //     status:'Error ' + err,
        // });

    }  
};

exports.createworkload= async (req,res) => {

    try{
        const user1=req.query.user;
        const colid=req.query.colid;
        //const weeks=parseInt(req.body.weeks) + 1;
        const pat1= await Workload.create({
            name: req.query.name,
            colid: colid,
            hours: req.query.hours,
            coursecode: req.query.coursecode,
            semester: req.query.semester,
            program: req.query.program,
            module: req.query.module,
            type: 'Academic',
            course: req.query.course,
            section: req.query.section,
            status: 1,
            year:req.query.year,
            user: req.query.user
        });
        return res.status(200).json({
            status:'Success',
        });
        
        
    } catch(err) {
        // return res.status(200).json({
        //     status:'Error ' + err,
        // });
    }   
};

exports.getperiod= async (req,res) => {
    try{
        const colid=req.query.colid;
        const lcat1233= await Period.find().sort('periodnumber')
            .where('colid')
            .equals(colid);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.createperiod= async (req,res) => {

    try{
        const user1=req.query.user;
        const colid=req.query.colid;
        //const weeks=parseInt(req.body.weeks) + 1;
        const pat1= await Period.create({
            name: req.query.name,
            colid: colid,
            periodtitle: req.query.periodtitle,
            starttime: req.query.starttime,
            endtime: req.query.endtime,
            periodnumber: req.query.periodnumber,
            user: req.query.user
        });
        return res.status(200).json({
            status:'Success',
        });
        
        
    } catch(err) {
       /* return res.status(200).json({
            status:'Error ' + err,
        }); */
    }   
};

exports.getviewclass= async (req,res) => {
    //res.cookie("user","Akshata");
  
    try{
        const user1=req.query.user;
        const lcat1233= await Class.find().sort('-classdate')
            .where('user')
            .equals(user1);

            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getclassbydate= async (req,res) => {
    //res.cookie("user","Akshata");
  
    try{
        const user1=req.query.user;
        const dt1=new Date(req.query.classdate);
        dt1.setHours(dt1.getHours() - dt1.getHours());
        dt1.setMinutes(dt1.getMinutes() - dt1.getMinutes());
        const lcat1233= await Class.find().sort('-classdate')
            .where('user')
            .equals(user1)
            .where('classdate')
            .gte(dt1);

            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getclassbycourse= async (req,res) => {
    //res.cookie("user","Akshata");
  
    try{
        const user1=req.query.user;
        // const dt1=new Date(req.query.classdate);
        // dt1.setHours(dt1.getHours() - dt1.getHours());
        // dt1.setMinutes(dt1.getMinutes() - dt1.getMinutes());
        const lcat1233= await Class.find().sort('-classdate')
            .where('user')
            .equals(user1)
            .where('coursecode')
            .gte(req.query.coursecode);

            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.createclassadv= async (req,res) => {

    try{
        
        const weeks=parseInt(req.query.weeks) + 1;
        var i;
            const newdate=new Date(req.query.classdate + ' ' + req.query.classtime);
            //var dt1=new Date(newdate);
            var dt1=new Date(req.query.classdate);
            var ar=req.query.classtime.split(":");
            dt1.setHours(dt1.getHours() - dt1.getHours() + 24 + parseInt(ar[0]));
            dt1.setMinutes(dt1.getMinutes() - dt1.getMinutes() + parseInt(ar[1]));

            for (i = 0; i < weeks; i++) { 

                const pat1= await Class.findOneAndUpdate({colid: req.query.colid, user: req.query.user, classdate: dt1},{
                    name: req.query.name,
                    coursecode: req.query.coursecode,
                    link: req.query.link,
                    semester: req.query.semester,
                    program: req.query.program,
                    module: req.query.module,
                    topic: req.query.topic,
                    course: req.query.course,
                    section: req.query.section,
                    status: 1,
                    enrollreq: "Yes",
                    classtime: req.body.classtime
                }, {
                    new: true,
                    upsert: true 
                });
                
                
                dt1.setDate(dt1.getDate() + 7);
            
            }
            return res.status(200).json({
                status:'Success',
            });
        
    } catch(err) {
    //     req.flash("error", "Data could not be added successfully. Error " + err );
    //    //req.flash("success", "Category has been added successfully for " + req.cookie.user);
    //    res.status(200).render('addclass1', {
    //     title: 'Add Class'
    // });
    }   
};

exports.deleteperiod= async (req,res) => {
    try{
        await Period.findByIdAndDelete(req.query.id);
        return res.status(200).json({
            status:'Success',
        });
    } catch(err) {
       /*  return res.status(200).json({
            status:'Error',
            message: err
        }); */
    }   
};

exports.deletekpi= async (req,res) => {
    try{
        await Kpi.findByIdAndDelete(req.query.id);
        return res.status(200).json({
            status:'Success',
        });
    } catch(err) {
       /*  return res.status(200).json({
            status:'Error',
            message: err
        }); */
    }   
};

exports.deleteaccrcomments= async (req,res) => {
    try{
        await Accrcomments.findByIdAndDelete(req.query.id);
        return res.status(200).json({
            status:'Success',
        });
    } catch(err) {
       /*  return res.status(200).json({
            status:'Error',
            message: err
        }); */
    }   
};

exports.getclassstudlist= async (req,res) => {
    try{
        const user1=req.query.user;
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
              //console.log(verified);
    
        } catch(err1234) {
            //console.log(err1234);
        }
        //console.log(jwtuser + '-' + jwtcolid);
        const lcat1233= await Classenr
            .aggregate([
                {
                    $lookup: {
                      from: 'users', 
                      localField: 'regno', 
                      foreignField: 'regno', 
                      as: 'userdetails'
                    }
                  }, {
                    $match: {
                      'coursecode': req.query.coursecode,
                      'user': req.query.user, 
                      'colid': parseInt(req.query.colid)
                    }
                  }
                  ]);
            
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getclassstudlistsec= async (req,res) => {
    try{
        const user1=req.query.user;
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
              //console.log(verified);
    
        } catch(err1234) {
            //console.log(err1234);
        }
        //console.log(jwtuser + '-' + jwtcolid);
        const lcat1233= await Classenr
            .aggregate([
                {
                    $lookup: {
                      from: 'users', 
                      localField: 'regno', 
                      foreignField: 'regno', 
                      as: 'userdetails'
                    }
                  }, {
                    $match: {
                      'coursecode': req.query.coursecode,
                      'user': req.query.user, 
                      'colid': parseInt(req.query.colid),
                      'section': req.query.section
                    }
                  }
                  ]);
            
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};


exports.deleteclassenr= async (req,res) => {
    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        //console.log(jwtuser + '-' + jwtcolid);
        await Classenr.findByIdAndDelete(req.query.id);
        return res.status(200).json({
            status:'Success',
        });
    } catch(err) {
       /*  return res.status(200).json({
            status:'Error',
            message: err
        }); */
    }   
};

exports.deleteclassenrall= async (req,res) => {
    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        
        await Classenr.deleteMany({ colid: parseInt(req.query.colid), user: req.query.user, coursecode: req.query.coursecode });
        return res.status(200).json({
            status:'Success',
        });
    } catch(err) {
       /*  return res.status(200).json({
            status:'Error',
            message: err
        }); */
    }   
};

exports.getattreport= async (req,res) => {
    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Attend.aggregate([
            { 
                $match: {colid: colid1, coursecode: req.query.coursecode }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        name: '$name',
                        regno: '$regno'
                    },
                    total_attendance: {$sum: '$status'}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};


exports.getattreportbydate= async (req,res) => {
    try{
        //const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        const date1=new Date();
        var date2=new Date();
        date2.setDate(date1.getDate() + 1);
        date1.setDate(date1.getDate() - 180);
       
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Attend.aggregate([
            { 
                $match: {
                    colid: colid1, 
                    programcode: req.query.programcode,
                    year:req.query.year,
                    semester: req.query.semester,
                    section: req.query.section,
                    classdate: {
                        $gte: date1,
                        $lte: date2
                    }

                }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        name: '$name',
                        regno: '$regno',
                        coursecode: '$coursecode'
                    },
                    total_attendance: {$sum: '$status'},
                    total_entries: {$sum: 1}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getattreportbyfaccl= async (req,res) => {
    try{
        //const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        const date1=new Date();
        var date2=new Date();
        date2.setDate(date1.getDate() + 1);
        date1.setDate(date1.getDate() - 7);
       
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Attend.aggregate([
            { 
                $match: {
                    colid: colid1, 
                    programcode: req.query.programcode,
                    year:req.query.year,
                    semester: req.query.semester,
                    section: req.query.section

                }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        user: '$user',
                        coursecode: '$coursecode',
                        classdate: '$classdate'
                    },
                    total_attendance: {$sum: '$status'},
                    total_entries: {$sum: 1}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getattreportbyfac= async (req,res) => {
    try{
        //const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        const date1=new Date();
        var date2=new Date();
        date2.setDate(date1.getDate() + 1);
        date1.setDate(date1.getDate() - 7);
       
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Attend.aggregate([
            { 
                $match: {
                    colid: colid1, 
                    programcode: req.query.programcode,
                    year:req.query.year,
                    semester: req.query.semester,
                    section: req.query.section

                }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        user: '$user',
                        coursecode: '$coursecode'
                    },
                    total_attendance: {$sum: '$status'},
                    total_entries: {$sum: 1}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};



exports.getmyfeedback= async (req,res) => {
    //res.cookie("user","Akshata");
  
    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const user1=req.query.user;
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Feedback.aggregate([
            { 
                $match: {colid: colid1, facultyemail: user1 }
            },
            { 
                $group: {
                    _id:'$question', 
                    avg_score: {$avg: '$score'}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};


exports.getmyfeedbackall= async (req,res) => {
    //res.cookie("user","Akshata");
  
    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        //const user1=req.query.user;
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Feedback.aggregate([
            { 
                $match: {colid: colid1 }
            },
            { 
                $group: {
                    _id: {
                        faculty: '$faculty',
                        question: '$question'
                    },
                    avg_score: {$avg: '$score'},
                    total_students: {$sum: 1}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};


exports.createassignment= async (req,res) => {


    try{
        const token=req.body.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const user1=req.body.user;
        const colid=req.body.colid;
        const name=req.body.name;
        var dt1=new Date(req.body.classdate);
        const pat1= await Assignment.create({
            colid: colid,
            coursecode: req.body.coursecode,
            topic: req.body.topic,
            link: req.file.location,
            course: req.body.course,
            status: 1,
            classdate: dt1, //req.body.classdate,
            user: user1,
            name: name
        });
        return res.status(200).json({
            status:'Success'
             
        }); 
        
    
    } catch(err) {
       /* return res.status(200).json({
            status:'Error',
            message: err  
        });  */

    }   
};

exports.getassignmentlist= async (req,res) => {
    //res.cookie("user","Akshata");

    const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
  
    try{
        const user1=req.query.user;
        const lcat1233= await Assignment.find()
            .where('user')
            .equals(user1)
            .where('coursecode')
            .equals(req.query.coursecode);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.deleteassignment= async (req,res) => {
    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        await Assignment.findByIdAndDelete(req.query.id);
        return res.status(200).json({
            status:'Success',
        });
    } catch(err) {
       /*  return res.status(200).json({
            status:'Error',
            message: err
        }); */
    }   
};

exports.createcoursefiles= async (req,res) => {

    try{
        const token=req.body.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const user1=req.body.user;
        const colid=req.body.colid;
        const name=req.body.name;
        const pat1= await Coursefiles.create({
            name: name,
            colid: colid,
            coursecode: req.body.coursecode,
            link: req.file.location,
            filename: req.file.key,
            status: 1,
            user: user1
        });
        return res.status(200).json({
            status:'Success',
        });
        
       
    } catch(err) {
        /* return res.status(200).json({
            status:'Error',
        }); */
        
    }   
};

exports.deletecoursefile= async (req,res) => {
    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        await Coursefiles.findByIdAndDelete(req.query.id);
        return res.status(200).json({
            status:'Success',
        });
    } catch(err) {
       /*  return res.status(200).json({
            status:'Error',
            message: err
        }); */
    }   
};

exports.getcoursefiles= async (req,res) => {
    //res.cookie("user","Akshata");

    const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
  
    try{
        const user1=req.query.user;
        const lcat1233= await Coursefiles.find()
            .where('user')
            .equals(user1)
            .where('coursecode')
            .equals(req.query.coursecode);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.deleteallassignments= async (req,res) => {
    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        await Assignment.deleteMany({ colid: req.query.colid, user: req.query.user, coursecode: req.query.coursecode });
        return res.status(200).json({
            status:'Success',
        });
    } catch(err) {
       /*  return res.status(200).json({
            status:'Error',
            message: err
        }); */
    }   
};

exports.getmyproctoring= async (req,res) => {
    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
       
        const dt1=new Date();
        dt1.setHours(dt1.getHours() +5);
        dt1.setMinutes(dt1.getMinutes() + 30);
        //console.log('Starting');
        const lcat1233= await Examenr.find()
            .where('proctoremail')
            .equals(req.query.user)
            .where('colid')
            .equals(req.query.colid)
            .where('enddate')
            .gte(dt1);
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            }); 
                      
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getexamenrlist= async (req,res) => {
    try{
        const user1=req.query.user;
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
              //console.log(verified);
    
        } catch(err1234) {
            //console.log(err1234);
        }
        //console.log(jwtuser + '-' + jwtcolid);
        const dt1=new Date();
        dt1.setHours(dt1.getHours() +5);
        dt1.setMinutes(dt1.getMinutes() + 30);
        const lcat1233= await Examenr
            .aggregate([
                {
                    $lookup: {
                      from: 'users', 
                      localField: 'regno', 
                      foreignField: 'regno', 
                      as: 'userdetails'
                    }
                  }, {
                    $match: {
                      'colid': parseInt(req.query.colid),
                      'enddate': {$gte: dt1}
                    }
                  }
                  ]);
            
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.facassigncomments= async (req,res) => {
    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
              //console.log(verified);
    
        } catch(err1234) {
            //console.log(err1234);
        }

        const lcat1233= await Assignsubmit.find()
            .where('assignmentid')
            .equals(req.query.assignmentid)
            .where('colid')
            .equals(req.query.colid);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }
            }); 
               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.loginapifold= async (req,res) => {
    try{

        const email=req.query.email;
        //const password=req.query.password;
        User.findOne({ email: email  }, (err, role) => {
            if (err) {
                res.status(201).json({
                    status:'Error'
                });
            }
            if(role) {
               
                const token=jwt.sign({ user: email, colid: String([role.colid]) }, process.env.JWT_SECRET, {
                    expiresIn: process.env.JWT_EXPIRES_IN
                });
                return res.status(200).json({
                    status:'Success',
                    user: String([role.email]),
                    password: String([role.password]),
                    role: String([role.role]),
                    name: String([role.name]),
                    colid: String([role.colid]),
                    regno: String([role.regno]),
                    lastlogin: String([role.lastlogin]),
                    status1: String([role.status1]),
                    section: String([role.section]),
                    semester: String([role.semester]),
                    department: String([role.department]),
                    token: token
                });
            } else {
                res.status(201).json({
                    status:'Invalid',
                });
            }
          });
    } catch(err) {
        // res.status(201).json({
        //     status:'Error ' + err,
        // });

    }  
};


exports.assigncomments= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
              //console.log(verified);
    
        } catch(err1234) {
            //console.log(err1234);
        }

        const lcat1= await Assignsubmit.findByIdAndUpdate( req.query.id,{
            comments: req.query.comments
        });
        return res.status(200).json({
            status:'Success',
        });
    } catch(err) {
        // res.status(201).json({
        //     status:'Error ' + err,
        // });

    }   
};


exports.getbooklist= async (req,res) => {
    try{
        const user1=req.query.user;
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
              //console.log(verified);
    
        } catch(err1234) {
            //console.log(err1234);
        }

        const lcat1233= await Libbooks.find()
            .where('colid')
            .equals(req.query.colid);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }
            }); 
            
                      
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getbookbyaccno= async (req,res) => {
    try{
        const user1=req.query.user;
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
              //console.log(verified);
    
        } catch(err1234) {
            //console.log(err1234);
        }

        const lcat1233= await Libbooks.find()
            .where('colid')
            .equals(req.query.colid)
            .where('accno')
            .equals(req.query.accno);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }
            }); 
            
                      
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getbookbyauthor= async (req,res) => {
    try{
        const user1=req.query.user;
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
              //console.log(verified);
    
        } catch(err1234) {
            //console.log(err1234);
        }

        const lcat1233= await Libbooks.find({ author: { $regex: '.*' + req.query.author + '.*', $options: 'i' }})
            .where('colid')
            .equals(req.query.colid);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }
            }); 
            
                      
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getbookbytitle= async (req,res) => {
    try{
        const user1=req.query.user;
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
              //console.log(verified);
    
        } catch(err1234) {
            //console.log(err1234);
        }

        const lcat1233= await Libbooks.find({ book: { $regex: '.*' + req.query.book + '.*', $options: 'i' }})
            .where('colid')
            .equals(req.query.colid);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }
            }); 
            
                      
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getbookbyaccno= async (req,res) => {
    try{
        const user1=req.query.user;
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
              //console.log(verified);
    
        } catch(err1234) {
            //console.log(err1234);
        }

        const lcat1233= await Libbooks.find({ accno: { $regex: '.*' + req.query.accno + '.*', $options: 'i' }})
            .where('colid')
            .equals(req.query.colid);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }
            }); 
            
                      
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};


exports.libissue= async (req,res) => {
    try{
        
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
              //console.log(verified);
    
        } catch(err1234) {
            //console.log(err1234);
        }
        const pat1= await Libassign.create({
            accno: req.query.accno,
            colid: req.query.colid,
            regno: req.query.regno,
            academicyear: '2020-21',
            duedate: req.query.duedate,
            issuedate: new Date(),
            status: 'Issued'
        });

        const pat2= await Libbooks.findOneAndUpdate({accno: req.query.accno, colid: req.query.colid},{
            status: 'Issued'
        });
        return res.status(200).json({
            status:'Success'
        }); 
            
                      
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.libreturn= async (req,res) => {
    try{
        
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
              //console.log(verified);
    
        } catch(err1234) {
            //console.log(err1234);
        }
        

        const lcat1= await Libassign.findByIdAndUpdate( req.query.bookid,{
            status: 'Returned',
            returndate: req.query.returndate,
            fine: req.query.fine,
            finestatus: 'Not paid'
        });

        
        const pat2= await Libbooks.findOneAndUpdate({accno: req.query.accno, colid: req.query.colid},{
            status: 'Available'
        });

        return res.status(200).json({
            status:'Success'
        }); 
            
                      
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getbookissuelist= async (req,res) => {
    try{
        
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
              //console.log(verified);
    
        } catch(err1234) {
            //console.log(err1234);
        }

        const lcat1233= await Libassign.find()
            .where('colid')
            .equals(req.query.colid)
            .where('issuedate')
            .gte(req.query.ldate)
            .where('issuedate')
            .lte(req.query.gdate);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }
            }); 
            
                      
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.deletelibbook= async (req,res) => {
    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        await Libbooks.findByIdAndDelete(req.query.id);
        return res.status(200).json({
            status:'Success',
        });
    } catch(err) {
       /*  return res.status(200).json({
            status:'Error',
            message: err
        }); */
    }   
};

exports.deleteworkloadapi= async (req,res) => {
    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        //console.log(jwtuser + '-' + jwtcolid);
        await Workload.findByIdAndDelete(req.query.id);
        return res.status(200).json({
            status:'Success',
        });
    } catch(err) {
       /*  return res.status(200).json({
            status:'Error',
            message: err
        }); */
    }   
};

exports.getseminaramount= async (req,res) => {
    try{
        const user1=req.query.user;
        const colid1=parseInt(req.query.colid);
        
            const lcat1233= await Seminar.aggregate([
                { 
                    $match: {user: user1 }
                },
                { 
                    $group: {
                        _id:'$yop', 
                        total_attendance: {$sum: '$amount'}
                    }
                }
            ]);
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }
            }); 
                      
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getprojectsamount= async (req,res) => {
    try{
        const user1=req.query.user;
        const colid1=parseInt(req.query.colid);
        
            const lcat1233= await Projects.aggregate([
                { 
                    $match: {user: user1 }
                },
                { 
                    $group: {
                        _id:'$yop', 
                        total_attendance: {$sum: '$funds'}
                    }
                }
            ]);
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }
            }); 
                      
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getseminarcount= async (req,res) => {
    try{
        const user1=req.query.user;
        const colid1=parseInt(req.query.colid);
        
            const lcat1233= await Seminar.aggregate([
                { 
                    $match: {user: user1 }
                },
                { 
                    $group: {
                        _id:'$yop', 
                        total_attendance: {$sum: 1}
                    }
                }
            ]);
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }
            }); 
                      
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};



exports.getbookcount= async (req,res) => {
    try{
        const user1=req.query.user;
        //const colid1=parseInt(req.query.colid);
        
            const lcat1233= await Book.aggregate([
                { 
                    $match: {user: user1 }
                },
                { 
                    $group: {
                        _id:'$yop', 
                        total_attendance: {$sum: 1}
                    }
                }
            ]);
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }
            }); 
                      
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getprojectscount= async (req,res) => {
    try{
        const user1=req.query.user;
        //const colid1=parseInt(req.query.colid);
        
            const lcat1233= await Projects.aggregate([
                { 
                    $match: {user: user1 }
                },
                { 
                    $group: {
                        _id:'$yop', 
                        total_attendance: {$sum: 1}
                    }
                }
            ]);
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }
            }); 
                      
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getpatentsscount= async (req,res) => {
    try{
        const user1=req.query.user;
        //const colid1=parseInt(req.query.colid);
        
            const lcat1233= await Patents.aggregate([
                { 
                    $match: {user: user1 }
                },
                { 
                    $group: {
                        _id:'$yop', 
                        total_attendance: {$sum: 1}
                    }
                }
            ]);
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }
            }); 
                      
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getpublicationscount= async (req,res) => {
    try{
        const user1=req.query.user;
        //const colid1=parseInt(req.query.colid);
        
            const lcat1233= await Publication.aggregate([
                { 
                    $match: {user: user1 }
                },
                { 
                    $group: {
                        _id:'$yop', 
                        total_attendance: {$sum: 1}
                    }
                }
            ]);
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }
            }); 
                      
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.bulkco1= async (req,res) => {
    try{
        //const user1=req.query.user;
        //const colid1=parseInt(req.query.colid);
        
            const lcat1233= await Cocal.aggregate([
                { 
                    $match: {coursecode: req.query.coursecode }
                },
                { 
                    $group: {
                        _id:'$course', 
                        co1: {$avg: '$co1'}
                    }
                }
            ]);
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }
            }); 
                      
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getempfeedbackanalysis= async (req,res) => {
    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Employer.aggregate([
            { 
                $match: {colid: colid1 }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        question: '$question',
                        score: '$score'
                    },
                    total_attendance: {$sum: 1}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getparentfeedbackscores= async (req,res) => {
    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Parent.aggregate([
            { 
                $match: {colid: colid1 }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        question: '$question',
                        score: '$score'
                    },
                    total_attendance: {$sum: 1}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getparentfeedbackscoresbyq= async (req,res) => {
    try{
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Parent.aggregate([
            { 
                $match: {colid: colid1, question: req.query.question }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        question: '$question',
                        score: '$score'
                    },
                    total_attendance: {$sum: 1}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getparentfeedbackq= async (req,res) => {
    try{
        
        

        const lcat1233= await Parent.distinct('question')
            .where('colid')
            .equals(req.query.colid);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }
            }); 
            
                      
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getkpi= async (req,res) => {
    try{
        const lcat1233= await Kpi.find()
            .where('colid')
            .equals(req.query.colid);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }
            }); 
            
                      
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};


exports.getparentfeedbackavgscore= async (req,res) => {
    try{
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Parent.aggregate([
            { 
                $match: {colid: colid1 }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        question: '$question'
                    },
                    total_attendance: {$avg: '$score'}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getemployerfeedbackavgscore= async (req,res) => {
    try{
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Employer.aggregate([
            { 
                $match: {colid: colid1 }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        question: '$question'
                    },
                    total_attendance: {$avg: '$score'}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getcurriculumfeedbackavgscore= async (req,res) => {
    try{
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Feedback.aggregate([
            { 
                $match: {colid: colid1, type: { $regex: '.*' + 'curriculum' + '.*', $options: 'i' } }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        question: '$question'
                    },
                    total_attendance: {$avg: '$score'}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getcurriculumfeedbackscoresbyq= async (req,res) => {
    try{
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Feedback.aggregate([
            { 
                $match: {colid: colid1, question: req.query.question }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        question: '$question',
                        score: '$score'
                    },
                    total_attendance: {$sum: 1}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getemployerfeedbackscoresbyq= async (req,res) => {
    try{
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Employer.aggregate([
            { 
                $match: {colid: colid1, question: req.query.question }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        question: '$question',
                        score: '$score'
                    },
                    total_attendance: {$sum: 1}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getlastcurriculumfeedback= async (req,res) => {
    try{
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Feedback.aggregate([
            { 
                $match: {colid: colid1, type: { $regex: '.*' + 'curriculum' + '.*', $options: 'i' } }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        question: '$colid'
                    },
                    total_attendance: {$max: '$feedbackdate'}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getlastfacultyfeedback= async (req,res) => {
    try{
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Feedback.aggregate([
            { 
                $match: {colid: colid1, type: { $regex: '.*' + 'Faculty' + '.*', $options: 'i' } }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        question: '$colid'
                    },
                    total_attendance: {$max: '$feedbackdate'}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getlastemployerfeedback= async (req,res) => {
    try{
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Employer.aggregate([
            { 
                $match: {colid: colid1 }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        question: '$colid'
                    },
                    total_attendance: {$max: '$feedbackdate'}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};


exports.getmoualert= async (req,res) => {
    try{
        
        const colid1=parseInt(req.query.colid);
        var moucount=0;
        const lcat1233= await Mou.aggregate([
            { 
                $match: {colid: colid1, year: req.query.year }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        question: '$colid'
                    },
                    total_attendance: {$sum: 1}
                }
            }
        ]);
        lcat1233.forEach(async function(data){
            //console.log(data.link);
            moucount=data.total_attendance;
            
        })
        const lcat1=await Kpi.findOneAndUpdate( {metric: '3.7.2', colid: colid1},{
            currentvalue: moucount
        });
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                moucount: moucount,
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getfacultyfeedbackcount= async (req,res) => {
    try{
        
        const colid1=parseInt(req.query.colid);
        var moucount=0;
        const lcat1233= await Feedback.aggregate([
            { 
                $match: {colid: colid1, type: { $regex: '.*' + 'Faculty' + '.*', $options: 'i' } }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        question: '$colid'
                    },
                    total_attendance: {$sum: 1}
                }
            }
        ]);
        lcat1233.forEach(async function(data){
            //console.log(data.link);
            moucount=data.total_attendance;
            
        })
      
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                moucount: moucount
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getcurriculumfeedbackcount= async (req,res) => {
    try{
        
        const colid1=parseInt(req.query.colid);
        var moucount=0;
        const lcat1233= await Feedback.aggregate([
            { 
                $match: {colid: colid1, type: { $regex: '.*' + 'curriculum' + '.*', $options: 'i' } }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        question: '$colid'
                    },
                    total_attendance: {$sum: 1}
                }
            }
        ]);
        lcat1233.forEach(async function(data){
            //console.log(data.link);
            moucount=data.total_attendance;
            
        })
      
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                moucount: moucount
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getemployerfeedbackcount= async (req,res) => {
    try{
        
        const colid1=parseInt(req.query.colid);
        var moucount=0;
        const lcat1233= await Employer.aggregate([
            { 
                $match: {colid: colid1 }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        question: '$colid'
                    },
                    total_attendance: {$sum: 1}
                }
            }
        ]);
        lcat1233.forEach(async function(data){
            //console.log(data.link);
            moucount=data.total_attendance;
            
        })
      
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                moucount: moucount
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getlastiqac= async (req,res) => {
    try{
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Meeting.aggregate([
            { 
                $match: {colid: colid1, category: 'IQAC' }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        question: '$colid'
                    },
                    total_attendance: {$max: '$classdate'}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getiqaccount= async (req,res) => {
    try{
        
        const colid1=parseInt(req.query.colid);
        var moucount=0;
        const lcat1233= await Meeting.aggregate([
            { 
                $match: {colid: colid1, category: 'IQAC', academicyear: req.query.year }
            },
            { 
                $group: {
                    _id: {
                        question: '$colid'
                    },
                    total_attendance: {$sum: 1}
                }
            }
        ]);
        lcat1233.forEach(async function(data){
            //console.log(data.link);
            moucount=data.total_attendance;
            
        })
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                moucount: moucount
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getdynamicmodules= async (req,res) => {
    try{
        
        const colid1=parseInt(req.query.colid);
        var moucount=0;
        const lcat1233= await Class.aggregate([
            { 
                $match: {colid: colid1, coursecode: req.query.coursecode }
            },
            { 
                $group: {
                    _id: {
                        module: '$module',
                        topic: '$topic',
                    },
                    total_attendance: {$sum: 1}
                }
            }
        ]);
      
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getcourseworkdiary= async (req,res) => {
    try{
        
        const colid1=parseInt(req.query.colid);
        var moucount=0;
        const lcat1233= await Class.aggregate([
            { 
                $match: {colid: colid1, user: req.query.user }
            },
            { 
                $group: {
                    _id: {
                        coursecode: '$coursecode',
                        course: '$course',
                        semester: '$semester',
                        section: '$section',
                        module: '$module',
                        topic: '$topic',
                        classdate: '$classdate',
                    },
                    total_attendance: {$sum: 1}
                }
            }
        ]);
      
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getvaclist= async (req,res) => {
    try{
        const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            // const decoded=await promisify(jwt.decode)(token, process.env.JWT_SECRET);
            // console.log(decoded);
            // console.log(decoded.colid + '-' + decoded.user);
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
              //console.log(verified);
    
        } catch(err1234) {
            //console.log(err1234);
        }
        //console.log(jwtuser + '-' + jwtcolid);

        
        const lcat1233= await Vacattendance.find()
            .where('colid')
            .equals(colid);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getvaclistcount= async (req,res) => {
    try{
        
        const colid1=parseInt(req.query.colid);
        var moucount=0;
        const lcat1233= await Vacattendance.aggregate([
            { 
                $match: {colid: colid1}
            },
            { 
                $group: {
                    _id: {
                        regno: '$regno',
                        name: '$name',
                        coursecode: '$coursecode',
                        course: '$course',
                    },
                    total_attendance: {$sum: 1}
                }
            }
        ]);
      
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getfacultylist= async (req,res) => {
    try{
        const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        const lcat1233= await User.find().sort('name')
            .where('colid')
            .equals(colid)
            .where('role')
            .equals('Faculty');
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.deleteroleusers= async (req,res) => {
    try{
        const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        await User.deleteMany({ colid: colid, role: req.query.role });
            return res.status(200).json({
                status:'Success'  
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.deletestudentsprogramcode= async (req,res) => {
    try{
        const colid=parseInt(req.query.colid);
        const token=req.query.token;
        const programcode=req.query.programcode;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        await User.deleteMany({ colid: colid, role: 'Student', programcode: programcode });
            return res.status(200).json({
                status:'Success'  
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};


exports.deleteroleyrusers= async (req,res) => {
    try{
        const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        await User.deleteMany({ colid: colid, role: req.query.role, admissionyear: req.query.admissionyear });
            return res.status(200).json({
                status:'Success'  
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.deleteallkpi= async (req,res) => {
    try{
        const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        await Kpi.deleteMany({ colid: colid });
            return res.status(200).json({
                status:'Success'  
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};


exports.getalumnifeedbackscoresbyq= async (req,res) => {
    try{
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Alumni.aggregate([
            { 
                $match: {colid: colid1, question: req.query.question }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        question: '$question',
                        score: '$score'
                    },
                    total_attendance: {$sum: 1}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getalumnifeedbackavgscore= async (req,res) => {
    try{
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Alumni.aggregate([
            { 
                $match: {colid: colid1 }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        question: '$question'
                    },
                    total_attendance: {$avg: '$score'}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};


exports.getdepartmentlist= async (req,res) => {
    try{
        const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        const lcat1233= await User.distinct('department')
            .where('colid')
            .equals(colid)
            .where('role')
            .equals('Faculty');
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.sendmail = async (req,res) => {
    try {
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        const transporter=nodemailer.createTransport({
            service: 'Gmail',
            auth: {
                user: 'support@campus.technology',
                pass: 'Hello@1234'
            
            }
        });
        const mailoptions= {
            from: req.query.from,
            to: req.query.to,
            cc: req.query.cc,
            subject: req.query.subject,
            html:req.query.html,
            text: htmltotext.fromString(req.query.html)

        }
        await transporter.sendMail(mailoptions);
        return res.status(200).json({
            status:'Success'  
        }); 
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    } 
}


exports.getmlink= async (req,res) => {
    try{
        const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        const lcat1233= await Mlink.find()
            .where('user')
            .equals(req.query.user);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.createmlink= async (req,res) => {


    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const user1=req.query.user;
        const colid=req.query.colid;
        const name=req.query.name;
        
        const pat1= await Mlink.create({
            colid: colid,
            category: req.query.category,
            link: req.query.link,
            user: user1,
            name: name
        });
        return res.status(200).json({
            status:'Success'
             
        }); 
        
    
    } catch(err) {
       /* return res.status(200).json({
            status:'Error',
            message: err  
        });  */

    }   
};

exports.updatemlink= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const lcat1= await Mlink.findByIdAndUpdate( req.query.id,{
            name: req.query.name,
            user: req.query.user,
            category: req.query.category,
            link: req.query.link,
            colid: req.query.colid
           
        });
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }   
};

exports.deletemlink= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const user=req.query.user;
        await Mlink.findByIdAndDelete(req.query.id);
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */


    }   
};





exports.getdepartment= async (req,res) => {
    try{
        const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        const lcat1233= await Department.find()
            .where('user')
            .equals(req.query.user);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getalldepartment= async (req,res) => {
    try{
        const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        const lcat1233= await Department.find()
            .where('colid')
            .equals(req.query.colid);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};



exports.createdepartment= async (req,res) => {


    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const user1=req.query.user;
        const colid=req.query.colid;
        const name=req.query.name;
        
        const pat1= await Department.create({
            colid: colid,
            department: req.query.department,
            hodname: req.query.hodname,
            hodemail: req.query.hodemail,
            hodphone: req.query.hodphone,
            user: user1,
            name: name
        });
        return res.status(200).json({
            status:'Success'
             
        }); 
        
    
    } catch(err) {
       /* return res.status(200).json({
            status:'Error',
            message: err  
        });  */

    }   
};

exports.updatedepartment= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const user1=req.query.user;
        const colid=req.query.colid;
        const name=req.query.name;
        const lcat1= await Department.findByIdAndUpdate( req.query.id,{
            colid: colid,
            department: req.query.department,
            hodname: req.query.hodname,
            hodemail: req.query.hodemail,
            hodphone: req.query.hodphone,
            user: user1,
            name: name
           
        });
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }   
};

exports.deletedepartment= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const user=req.query.user;
        await Department.findByIdAndDelete(req.query.id);
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */


    }   
};


exports.getalldepartments= async (req,res) => {
    try{
        const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        const lcat1233= await Department.distinct('department')
            .where('colid')
            .equals(colid);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};



exports.getaws= async (req,res) => {
    try{
        const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        const lcat1233= await Awsconfig.find()
            .where('colid')
            .equals(req.query.colid);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.createaws= async (req,res) => {


    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const user1=req.query.user;
        const colid=req.query.colid;
        const name=req.query.name;
        
        const pat1= await Awsconfig.create({
            colid: colid,
            username: req.query.username,
            password: req.query.password,
            region: req.query.region,
            bucket: req.query.bucket,
            type:req.query.type,
            user: user1,
            name: name
        });
        return res.status(200).json({
            status:'Success'
             
        }); 
        
    
    } catch(err) {
       /* return res.status(200).json({
            status:'Error',
            message: err  
        });  */

    }   
};

exports.updateaws= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const user1=req.query.user;
        const colid=req.query.colid;
        const name=req.query.name;
        const lcat1= await Awsconfig.findByIdAndUpdate( req.query.id,{
            colid: colid,
            username: req.query.username,
            password: req.query.password,
            region: req.query.region,
            bucket: req.query.bucket,
            type:req.query.type,
            user: user1,
            name: name
           
        });
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }   
};

exports.deleteaws= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const user=req.query.user;
        await Awsconfig.findByIdAndDelete(req.query.id);
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */


    }   
};




exports.getcircularfac= async (req,res) => {
    try{
        const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        const lcat1233= await Circularfac.find()
            .where('colid')
            .equals(req.query.colid)
            .where('role')
            .equals(req.query.role)
            .where('status1')
            .equals('Active');
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getcircularfacall= async (req,res) => {
    try{
        const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        const lcat1233= await Circularfac.find()
            .where('colid')
            .equals(req.query.colid);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};


exports.createcircularfac= async (req,res) => {


    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const user1=req.query.user;
        const colid=req.query.colid;
        const name=req.query.name;
        
        const pat1= await Circularfac.create({
            colid: colid,
            title: req.query.title,
            description: req.query.description,
            link: req.query.link,
            role: req.query.role,
            status1:req.query.status1,
            user: user1,
            name: name
        });
        return res.status(200).json({
            status:'Success'
             
        }); 
        
    
    } catch(err) {
       /* return res.status(200).json({
            status:'Error',
            message: err  
        });  */

    }   
};

exports.updatecircularfac= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const user1=req.query.user;
        const colid=req.query.colid;
        const name=req.query.name;
        const lcat1= await Circularfac.findByIdAndUpdate( req.query.id,{
            colid: colid,
            title: req.query.title,
            description: req.query.description,
            link: req.query.link,
            role: req.query.role,
            status1:req.query.status1,
            user: user1,
            name: name
           
        });
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }   
};

exports.deletecircularfac= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const user=req.query.user;
        await Circularfac.findByIdAndDelete(req.query.id);
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */


    }   
};


exports.getmyinstitutions= async (req,res) => {
    try{
        const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        const lcat1233= await Institutions.find()
            .where('admincolid')
            .equals(req.query.colid);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};


exports.getallinstitutions= async (req,res) => {
    try{
        const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        const lcat1233= await Institutions.find();
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getinstitutionname= async (req,res) => {
    try{
        const colid=parseInt(req.query.colid);
        //const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
       
        const lcat1233= await Institutions.find()
        .where('colid')
            .equals(req.query.colid);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.createinstitutions= async (req,res) => {


    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        
        
        const pat1= await Institutions.create({
            colid: req.query.colid,
            admincolid: req.query.admincolid,
            institutionname: req.query.institutionname,
            address: req.query.address,
            state: req.query.state,
            district: req.query.district,
            type: req.query.type,
            logo: req.query.logo,
            status:req.query.status,
            comments: req.query.comments
        });
        return res.status(200).json({
            status:'Success'
             
        }); 
        
    
    } catch(err) {
       /* return res.status(200).json({
            status:'Error',
            message: err  
        });  */

    }   
};

exports.updateinstitutions= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
       
        const lcat1= await Institutions.findByIdAndUpdate( req.query.id,{
            colid: req.query.colid,
            admincolid: req.query.admincolid,
            institutionname: req.query.institutionname,
            address: req.query.address,
            state: req.query.state,
            district: req.query.district,
            type: req.query.type,
            logo: req.query.logo,
            status:req.query.status,
            comments: req.query.comments
           
        });
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }   
};

exports.deleteinstitutions= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const user=req.query.user;
        await Institutions.findByIdAndDelete(req.query.id);
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */


    }   
};


exports.allattend= async (req,res) => {
    //res.cookie("user","Akshata");
  
    try{
        
        const user1=req.query.user;
        
        const colid=req.query.colid;
        
        if(user1) {
            //const lcat1233= await Pat.findById(req.params.id);
            const lcat1233= await Classenr.find()
            .where('user')
            .equals(user1)
            .where('coursecode')
            .equals(req.query.coursecode);
            //console.log(lcat1233);
            lcat1233.forEach(async function(data){
                //console.log(data.link);
                //link=data.link;
                const pat1= await Attend.findOneAndUpdate({classid: req.query.classid, regno: data.regno},{
                    name: data.student,
                    colid: colid,
                    coursecode: req.query.coursecode,
                    semester: req.query.semester,
                    course: req.query.course,
                    section: req.query.section,
                    status: 1,
                    classdate: req.query.classdate, //req.body.classdate,
                    user: user1
                }, {
                    new: true,
                    upsert: true 
                });
               

            })
             return res.status(200).json({
                    status:'Success'
                }); 
            
        } else {
            return res.status(200).json({
                status:'Error',
         
            }); 

        }               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.allattendbysec= async (req,res) => {
    //res.cookie("user","Akshata");
  
    try{
        
        const user1=req.query.user;
        
        const colid=req.query.colid;
        
        if(user1) {
            //const lcat1233= await Pat.findById(req.params.id);
            const lcat1233= await Classenr.find()
            .where('user')
            .equals(user1)
            .where('coursecode')
            .equals(req.query.coursecode)
            .where('section')
            .equals(req.query.section);
            //console.log(lcat1233);
            lcat1233.forEach(async function(data){
                //console.log(data.link);
                //link=data.link;
                const pat1= await Attend.findOneAndUpdate({classid: req.query.classid, regno: data.regno},{
                    name: data.student,
                    colid: colid,
                    coursecode: req.query.coursecode,
                    semester: req.query.semester,
                    course: req.query.course,
                    section: req.query.section,
                    status: 1,
                    classdate: req.query.classdate, //req.body.classdate,
                    user: user1
                }, {
                    new: true,
                    upsert: true 
                });
               

            })
             return res.status(200).json({
                    status:'Success'
                }); 
            
        } else {
            return res.status(200).json({
                status:'Error',
         
            }); 

        }               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};


exports.allattendbysec1= async (req,res) => {
    //res.cookie("user","Akshata");
  
    try{
        
        const user1=req.query.user;
        
        const colid=req.query.colid;
        
        if(user1) {
            //const lcat1233= await Pat.findById(req.params.id);
            const lcat1233= await Classenr.find()
            .where('user')
            .equals(user1)
            .where('coursecode')
            .equals(req.query.coursecode)
            .where('section')
            .equals(req.query.section)
            .where('academicyear')
            .equals(req.query.academicyear);
            //console.log(lcat1233);
            lcat1233.forEach(async function(data){
                //console.log(data.link);
                //link=data.link;
                const pat1= await Attend.findOneAndUpdate({classid: req.query.classid, regno: data.regno},{
                    name: data.student,
                    colid: colid,
                    coursecode: req.query.coursecode,
                    semester: req.query.semester,
                    course: req.query.course,
                    programcode: req.query.programcode,
                    program:req.query.program,
                    year:req.query.year,
                    section: req.query.section,
                    status: 1,
                    classdate: req.query.classdate, //req.body.classdate,
                    user: user1
                }, {
                    new: true,
                    upsert: true 
                });
               

            })
             return res.status(200).json({
                    status:'Success'
                }); 
            
        } else {
            return res.status(200).json({
                status:'Error',
         
            }); 

        }               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};



exports.getclassattendance= async (req,res) => {
    try{
        const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        const lcat1233= await Attend.find().sort(req.query.sort)
            .where('user')
            .equals(req.query.user)
            .where('coursecode')
            .equals(req.query.coursecode)
            .where('classid')
            .equals(req.query.classid);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};



exports.updateattendance= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
       
        const lcat1= await Attend.findByIdAndUpdate( req.query.id,{
            status:parseInt(req.query.status)
           
        });
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }   
};

exports.deleteattendance= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const user=req.query.user;
        await Attend.findByIdAndDelete(req.query.id);
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */


    }   
};

exports.deppublist= async (req,res) => {
    try{
        //const user1=req.query.user;
        // const token=req.query.token;
        // //console.log(token);
        // let jwtuser='';
        // let jwtcolid='';
        // try {
        //     const verified = jwt.verify(
        //         token,
        //         process.env.JWT_SECRET,
        //         (err123, verified) => {
        //           if (err123) {
        //             return res.status(401).json({
        //                 status: 'Unauthorized',
        //                 error: err123
        //             });
        //           }
        //           jwtuser=verified.user;
        //           jwtcolid=verified.colid;
        //           return verified;
        //         }
        //       );
        //       //console.log(verified);
    
        // } catch(err1234) {
        //     //console.log(err1234);
        // }
        //console.log(jwtuser + '-' + jwtcolid);
        const lcat1233= await User
            .aggregate([
                {
                    $lookup: {
                      from: 'pubs', 
                      localField: 'email', 
                      foreignField: 'user', 
                      as: 'publications'
                    }
                  }, {
                    $match: {
                      'department': req.query.department,
                      'colid': parseInt(req.query.colid)
                    }
                  }
                  ]);
            
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.depsemlist= async (req,res) => {
    try{
        //const user1=req.query.user;
        // const token=req.query.token;
        // //console.log(token);
        // let jwtuser='';
        // let jwtcolid='';
        // try {
        //     const verified = jwt.verify(
        //         token,
        //         process.env.JWT_SECRET,
        //         (err123, verified) => {
        //           if (err123) {
        //             return res.status(401).json({
        //                 status: 'Unauthorized',
        //                 error: err123
        //             });
        //           }
        //           jwtuser=verified.user;
        //           jwtcolid=verified.colid;
        //           return verified;
        //         }
        //       );
        //       //console.log(verified);
    
        // } catch(err1234) {
        //     //console.log(err1234);
        // }
        //console.log(jwtuser + '-' + jwtcolid);
        const lcat1233= await User
            .aggregate([
                {
                    $lookup: {
                      from: 'seminars', 
                      localField: 'email', 
                      foreignField: 'user', 
                      as: 'seminars'
                    }
                  }, {
                    $match: {
                      'department': req.query.department,
                      'colid': parseInt(req.query.colid)
                    }
                  }
                  ]);
            
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.depprojectslist= async (req,res) => {
    try{
        //const user1=req.query.user;
        // const token=req.query.token;
        // //console.log(token);
        // let jwtuser='';
        // let jwtcolid='';
        // try {
        //     const verified = jwt.verify(
        //         token,
        //         process.env.JWT_SECRET,
        //         (err123, verified) => {
        //           if (err123) {
        //             return res.status(401).json({
        //                 status: 'Unauthorized',
        //                 error: err123
        //             });
        //           }
        //           jwtuser=verified.user;
        //           jwtcolid=verified.colid;
        //           return verified;
        //         }
        //       );
        //       //console.log(verified);
    
        // } catch(err1234) {
        //     //console.log(err1234);
        // }
        //console.log(jwtuser + '-' + jwtcolid);
        const lcat1233= await User
            .aggregate([
                {
                    $lookup: {
                      from: 'projects', 
                      localField: 'email', 
                      foreignField: 'user', 
                      as: 'projects'
                    }
                  }, {
                    $match: {
                      'department': req.query.department,
                      'colid': parseInt(req.query.colid)
                    }
                  }
                  ]);
            
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.depbookslist= async (req,res) => {
    try{
        //const user1=req.query.user;
        // const token=req.query.token;
        // //console.log(token);
        // let jwtuser='';
        // let jwtcolid='';
        // try {
        //     const verified = jwt.verify(
        //         token,
        //         process.env.JWT_SECRET,
        //         (err123, verified) => {
        //           if (err123) {
        //             return res.status(401).json({
        //                 status: 'Unauthorized',
        //                 error: err123
        //             });
        //           }
        //           jwtuser=verified.user;
        //           jwtcolid=verified.colid;
        //           return verified;
        //         }
        //       );
        //       //console.log(verified);
    
        // } catch(err1234) {
        //     //console.log(err1234);
        // }
        //console.log(jwtuser + '-' + jwtcolid);
        const lcat1233= await User
            .aggregate([
                {
                    $lookup: {
                      from: 'books', 
                      localField: 'email', 
                      foreignField: 'user', 
                      as: 'books'
                    }
                  }, {
                    $match: {
                      'department': req.query.department,
                      'colid': parseInt(req.query.colid)
                    }
                  }
                  ]);
            
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.bookdoclist= async (req,res) => {
    try{
        //const user1=req.query.user;
        // const token=req.query.token;
        // //console.log(token);
        // let jwtuser='';
        // let jwtcolid='';
        // try {
        //     const verified = jwt.verify(
        //         token,
        //         process.env.JWT_SECRET,
        //         (err123, verified) => {
        //           if (err123) {
        //             return res.status(401).json({
        //                 status: 'Unauthorized',
        //                 error: err123
        //             });
        //           }
        //           jwtuser=verified.user;
        //           jwtcolid=verified.colid;
        //           return verified;
        //         }
        //       );
        //       //console.log(verified);
    
        // } catch(err1234) {
        //     //console.log(err1234);
        // }
        //console.log(jwtuser + '-' + jwtcolid);
        const lcat1233= await Book
            .aggregate([
                {
                    $project: {
                      id: {
                        '$toString': '_id'
                      }
                    }
                },
                {
                    $lookup: {
                      from: 'supportingdocs', 
                      localField: 'id', 
                      foreignField: 'field1', 
                      as: 'docs'
                    }
                  }, {
                    $match: {
                      'colid': parseInt(req.query.colid)
                    }
                  }
                  ]);
            
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getstudentcount= async (req,res) => {
    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await User.aggregate([
            { 
                $match: {colid: colid1, role: 'Student' }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        programcode: '$programcode',
                        admissionyear: '$admissionyear'
                    },
                    total_attendance: {$sum: 1 }
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getfacultycount= async (req,res) => {
    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await User.aggregate([
            { 
                $match: {colid: colid1, role: { $in: ['Faculty', 'Admin','HoD' ] } }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        department: '$department',
                        role: '$role'
                    },
                    total_attendance: {$sum: 1 }
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getclasscount= async (req,res) => {
    try{
        
        

        const lcat1233= await Attend.distinct('classid')
        .where('colid')
        .equals(req.query.colid)
        .where('coursecode')
        .equals(req.query.coursecode);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }
            }); 
            
                      
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getclasscount2= async (req,res) => {
    try{
        //const user1=req.query.user;
        //const colid1=parseInt(req.query.colid);
        
            const lcat1233= await Attend.aggregate([
                { 
                    $match: {coursecode: req.query.coursecode, colid: req.query.colid }
                },
                { 
                    $group: {
                        _id:'$coursecode', 
                        total_attendance: {$sum: 1}
                    }
                }
            ]);
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }
            }); 
                      
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.gettaskassign= async (req,res) => {
    try{
        const user1=req.query.user;
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
              //console.log(verified);
    
        } catch(err1234) {
            //console.log(err1234);
        }

        const lcat1233= await Taskassign.find()
            .where('colid')
            .equals(req.query.colid);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }
            }); 
            
                      
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getstudentbycategory= async (req,res) => {
    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await User.aggregate([
            { 
                $match: {colid: colid1, role: 'Student' }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        programcode: '$programcode',
                        admissionyear: '$admissionyear',
                        category: '$category'
                    },
                    total_attendance: {$sum: 1 }
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getstudentbycatgender= async (req,res) => {
    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await User.aggregate([
            { 
                $match: {colid: colid1, role: 'Student' }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        programcode: '$programcode',
                        admissionyear: '$admissionyear',
                        category: '$category',
                        gender: '$gender'
                    },
                    total_attendance: {$sum: 1 }
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getstudentbygender= async (req,res) => {
    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        // try {
        //     const verified = jwt.verify(
        //         token,
        //         process.env.JWT_SECRET,
        //         (err123, verified) => {
        //           if (err123) {
        //             return res.status(401).json({
        //                 status: 'Unauthorized',
        //                 error: err123
        //             });
        //           }
        //           jwtuser=verified.user;
        //           jwtcolid=verified.colid;
        //           return verified;
        //         }
        //       );
        // } catch(err1234) {
        //     //console.log(err1234);
        // }
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await User.aggregate([
            { 
                $match: {colid: colid1, role: 'Student' }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        admissionyear: '$admissionyear',
                        gender: '$gender'
                    },
                    total_attendance: {$sum: 1 }
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};


exports.getstudentbycatnew= async (req,res) => {
    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
       
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await User.aggregate([
            { 
                $match: {colid: colid1, role: 'Student' }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        admissionyear: '$admissionyear',
                        category: '$category'
                    },
                    total_attendance: {$sum: 1 }
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getstudentbyquota= async (req,res) => {
    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
       
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await User.aggregate([
            { 
                $match: {colid: colid1, role: 'Student' }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        admissionyear: '$admissionyear',
                        category: '$quota'
                    },
                    total_attendance: {$sum: 1 }
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};


exports.getmetricrules= async (req,res) => {
    try{
        //const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        const lcat1233= await Metricrules.find()
            .where('accreditation')
            .equals(req.query.accreditation)
            .where('metric')
            .equals(req.query.metric);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};


exports.getallmetricrules= async (req,res) => {
    try{
        //const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        const lcat1233= await Metricrules.find();
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.createmetricrules= async (req,res) => {


    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        
        
        const pat1= await Metricrules.create({
            name: req.query.name,
            user: req.query.user,
            accreditation: req.query.accreditation,
            metric: req.query.metric,
            title: req.query.title,
            comments: req.query.comments
        });
        return res.status(200).json({
            status:'Success'
             
        }); 
        
    
    } catch(err) {
       /* return res.status(200).json({
            status:'Error',
            message: err  
        });  */

    }   
};

exports.updatemetricrules= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
       
        const lcat1= await Metricrules.findByIdAndUpdate( req.query.id,{
            name: req.query.name,
            user: req.query.user,
            accreditation: req.query.accreditation,
            metric: req.query.metric,
            title: req.query.title,
            comments: req.query.comments
           
        });
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }   
};

exports.deletemetricrules= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const user=req.query.user;
        await Metricrules.findByIdAndDelete(req.query.id);
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */


    }   
};

exports.getallusersbyrole= async (req,res) => {
    try{
        //const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        const lcat1233= await User.find()
            .where('colid')
            .equals(req.query.colid)
            .where('role')
            .equals(req.query.role);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getclassbyuser= async (req,res) => {
    try{
        //const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        const lcat1233= await Class.find().sort('-classdate')
            .where('colid')
            .equals(req.query.colid)
            .where('user')
            .equals(req.query.user);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.depaddoncourselist= async (req,res) => {
    try{
        
        const lcat1233= await User
            .aggregate([
                {
                    $lookup: {
                      from: 'addoncourses', 
                      localField: 'email', 
                      foreignField: 'user', 
                      as: 'courses'
                    }
                  }, {
                    $match: {
                      'department': req.query.department,
                      'colid': parseInt(req.query.colid)
                    }
                  }
                  ]);
            
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.depsyllabusrevlist= async (req,res) => {
    try{
        
        const lcat1233= await User
            .aggregate([
                {
                    $lookup: {
                      from: 'syllabusrevisions', 
                      localField: 'email', 
                      foreignField: 'user', 
                      as: 'courses'
                    }
                  }, {
                    $match: {
                      'department': req.query.department,
                      'colid': parseInt(req.query.colid)
                    }
                  }
                  ]);
            
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.depemployabilitylist= async (req,res) => {
    try{
        
        const lcat1233= await User
            .aggregate([
                {
                    $lookup: {
                      from: 'employabilities', 
                      localField: 'email', 
                      foreignField: 'user', 
                      as: 'courses'
                    }
                  }, {
                    $match: {
                      'department': req.query.department,
                      'colid': parseInt(req.query.colid)
                    }
                  }
                  ]);
            
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.depexplearninglist= async (req,res) => {
    try{
        
        const lcat1233= await User
            .aggregate([
                {
                    $lookup: {
                      from: 'experentiallearnings', 
                      localField: 'email', 
                      foreignField: 'user', 
                      as: 'courses'
                    }
                  }, {
                    $match: {
                      'department': req.query.department,
                      'colid': parseInt(req.query.colid)
                    }
                  }
                  ]);
            
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.updatepubcomments= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const lcat1= await Publication.findByIdAndUpdate( req.query.id,{
            status1: req.query.status1,
            comments: req.query.comments
           
        });
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }   
};



exports.getaccrcomments= async (req,res) => {
    try{
        //const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        const lcat1233= await Accrcomments.find()
            .where('field1')
            .equals(req.query.field1);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getallaccrcomments= async (req,res) => {
    try{
        //const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        const lcat1233= await Accrcomments.find()
            .where('colid')
            .equals(req.query.colid);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};



exports.createaccrcomments= async (req,res) => {


    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        
        
        const pat1= await Accrcomments.create({
            name: req.query.name,
            user: req.query.user,
            colid: req.query.colid,
            field1: req.query.field1,
            comments: req.query.comments,
            metric: req.query.metric,
            type: req.query.type
        });
        return res.status(200).json({
            status:'Success'
             
        }); 
        
    
    } catch(err) {
       /* return res.status(200).json({
            status:'Error',
            message: err  
        });  */

    }   
};

exports.updateseminarcomments= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const lcat1= await Seminar.findByIdAndUpdate( req.query.id,{
            status1: req.query.status1,
            comments: req.query.comments
           
        });
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }   
};

exports.updatepatentcomments= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const lcat1= await Patent.findByIdAndUpdate( req.query.id,{
            status1: req.query.status1,
            comments: req.query.comments
           
        });
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }   
};

exports.updateprojectscomments= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const lcat1= await Projects.findByIdAndUpdate( req.query.id,{
            status1: req.query.status1,
            comments: req.query.comments
           
        });
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }   
};

exports.updatebookscomments= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const lcat1= await Book.findByIdAndUpdate( req.query.id,{
            status1: req.query.status1,
            comments: req.query.comments
           
        });
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }   
};

exports.updateaddonccomments= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const lcat1= await Addonc.findByIdAndUpdate( req.query.id,{
            status1: req.query.status1,
            comments: req.query.comments
           
        });
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }   
};

exports.updatesyllabusrevcomments= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const lcat1= await Syllabusrev.findByIdAndUpdate( req.query.id,{
            datastatus: req.query.status1,
            comment: req.query.comments
           
        });
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }   
};


exports.updateemployabilitycomments= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const lcat1= await Employability.findByIdAndUpdate( req.query.id,{
            status1: req.query.status1,
            comments: req.query.comments
           
        });
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }   
};

exports.updateexplearningcomments= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const lcat1= await Explearning.findByIdAndUpdate( req.query.id,{
            status1: req.query.status1,
            comments: req.query.comments
           
        });
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }   
};

exports.dephigheredulist= async (req,res) => {
    try{
        
        const lcat1233= await User
            .aggregate([
                {
                    $lookup: {
                      from: 'highereducations', 
                      localField: 'email', 
                      foreignField: 'user', 
                      as: 'courses'
                    }
                  }, {
                    $match: {
                      'department': req.query.department,
                      'colid': parseInt(req.query.colid)
                    }
                  }
                  ]);
            
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.dephigherexamlist= async (req,res) => {
    try{
        
        const lcat1233= await User
            .aggregate([
                {
                    $lookup: {
                      from: 'higherexams', 
                      localField: 'email', 
                      foreignField: 'user', 
                      as: 'courses'
                    }
                  }, {
                    $match: {
                      'department': req.query.department,
                      'colid': parseInt(req.query.colid)
                    }
                  }
                  ]);
            
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.updatehighereducomments= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const lcat1= await Higheredu.findByIdAndUpdate( req.query.id,{
            status1: req.query.status1,
            comments: req.query.comments
           
        });
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }   
};

exports.updatehigherexamcomments= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const lcat1= await Higherexam.findByIdAndUpdate( req.query.id,{
            status1: req.query.status1,
            comments: req.query.comments
           
        });
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }   
};

exports.getallclass= async (req,res) => {
    //res.cookie("user","Akshata");
  
    try{
        const user1=req.query.user;
        const lcat1233= await Class.find().sort('-classdate')
            .where('colid')
            .equals(req.query.colid);

            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getallcousefiles= async (req,res) => {
    //res.cookie("user","Akshata");
  
    try{
        const user1=req.query.user;
        const lcat1233= await Coursefiles.find().sort('user')
            .where('colid')
            .equals(req.query.colid);

            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getallassignments= async (req,res) => {
    //res.cookie("user","Akshata");
  
    try{
        const user1=req.query.user;
        const lcat1233= await Assignment.find().sort('-classdate')
            .where('colid')
            .equals(req.query.colid);

            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};


exports.getssstext= async (req,res) => {
    try{
        //const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        const lcat1233= await Feedback.find()
        .where('colid')
        .equals(req.query.colid)
        .where('type')
        .equals('ssstext');
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getqspeers= async (req,res) => {
    try{
        //const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        const lcat1233= await Qspeer.find()
        .where('colid')
        .equals(req.query.colid);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.createqspeers= async (req,res) => {


    try{
        //const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        // try {
        //     const verified = jwt.verify(
        //         token,
        //         process.env.JWT_SECRET,
        //         (err123, verified) => {
        //           if (err123) {
        //             return res.status(401).json({
        //                 status: 'Unauthorized',
        //                 error: err123
        //             });
        //           }
        //           jwtuser=verified.user;
        //           jwtcolid=verified.colid;
        //           return verified;
        //         }
        //       );
        // } catch(err1234) {
        //     //console.log(err1234);
        // }
        
        
        const pat1= await Qspeer.create({
            name: req.query.name,
            user: req.query.user,
            email: req.query.email,
            phone: req.query.phone,
            institution: req.query.institution,
            designation: req.query.designation,
            country: req.query.country,
            colid:req.query.colid
        });
        return res.status(200).json({
            status:'Success'
             
        }); 
        
    
    } catch(err) {
       /* return res.status(200).json({
            status:'Error',
            message: err  
        });  */

    }   
};

exports.getqsemployers= async (req,res) => {
    try{
        //const colid=parseInt(req.query.colid);
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            
        }
        const lcat1233= await Qsemployers.find()
        .where('colid')
        .equals(req.query.colid);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getsemstatcount= async (req,res) => {
    try{
        //const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Seminar.aggregate([
            { 
                $match: {colid: colid1 }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        status: '$status1'
                    },
                    total_attendance: {$sum: 1}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getprojstatcount= async (req,res) => {
    try{
        //const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Project.aggregate([
            { 
                $match: {colid: colid1 }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        status: '$status1'
                    },
                    total_attendance: {$sum: 1}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getpubstatcount= async (req,res) => {
    try{
        //const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Publication.aggregate([
            { 
                $match: {colid: colid1 }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        status: '$status1'
                    },
                    total_attendance: {$sum: 1}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getpatstatcount= async (req,res) => {
    try{
        //const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Patent.aggregate([
            { 
                $match: {colid: colid1 }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        status: '$status1'
                    },
                    total_attendance: {$sum: 1}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getbookstatcount= async (req,res) => {
    try{
        //const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Book.aggregate([
            { 
                $match: {colid: colid1 }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        status: '$status1'
                    },
                    total_attendance: {$sum: 1}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};


exports.deppatentslist= async (req,res) => {
    try{
        
        const lcat1233= await User
            .aggregate([
                {
                    $lookup: {
                      from: 'patents', 
                      localField: 'email', 
                      foreignField: 'user', 
                      as: 'courses'
                    }
                  }, {
                    $match: {
                      'department': req.query.department,
                      'colid': parseInt(req.query.colid)
                    }
                  }
                  ]);
            
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.depconsultancylist= async (req,res) => {
    try{
        
        const lcat1233= await User
            .aggregate([
                {
                    $lookup: {
                      from: 'consultancies', 
                      localField: 'email', 
                      foreignField: 'user', 
                      as: 'courses'
                    }
                  }, {
                    $match: {
                      'department': req.query.department,
                      'colid': parseInt(req.query.colid)
                    }
                  }
                  ]);
            
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getlwattendance= async (req,res) => {
    try{
        const colid=parseInt(req.query.colid);
        var date1=new Date();
        var date2=new Date();
        
        
        const lcat1233= await Attend.find()
            .where('colid')
            .equals(req.query.colid)
            .where('classdate')
            .gte(date1)
            .where('classdate')
            .lte(date2);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.updatesupportingcomments= async (req,res) => {

    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        const lcat1= await Supportingdoc.findByIdAndUpdate( req.query.id,{
            status1: req.query.status1,
            comments: req.query.comments
           
        });
        
        return res.status(200).json({
            status:'Success'
            
        });
        
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }   
};


exports.projectdocs= async (req,res) => {
    try{
        
        const lcat1233= await Projects
            .aggregate([
                { $addFields: { 'userId': { $toString: '$_id' }}},
                {
                    $lookup: {
                      from: 'supportingdocs', 
                      localField: 'userId', 
                      foreignField: 'field1', 
                      as: 'seminars'
                    }
                  }, {
                    $match: {
                      'colid': parseInt(req.query.colid)
                    }
                  }
                  ]);
            
            //console.log(lcat1233);
            return res.status(200).json({
                status:'Success',
                data: {
                    classes : lcat1233
                }   
            });            
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getdeptfeedbackcount= async (req,res) => {
    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Deptfeedback.aggregate([
            { 
                $match: {colid: colid1 }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {
                        department: '$department',
                        name: '$fsname',
                        regno: '$regno'
                    },
                    total_attendance: {$sum: 1}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};


exports.getssscount= async (req,res) => {
    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Feedback.aggregate([
            { 
                $match: {colid: colid1 }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {                        
                        name: '$name',
                        regno: '$regno',
                        type: '$type'
                    },
                    total_attendance: {$avg: '$score'}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};

exports.getsssbyq= async (req,res) => {
    try{
        const token=req.query.token;
        //console.log(token);
        let jwtuser='';
        let jwtcolid='';
        try {
            const verified = jwt.verify(
                token,
                process.env.JWT_SECRET,
                (err123, verified) => {
                  if (err123) {
                    return res.status(401).json({
                        status: 'Unauthorized',
                        error: err123
                    });
                  }
                  jwtuser=verified.user;
                  jwtcolid=verified.colid;
                  return verified;
                }
              );
        } catch(err1234) {
            //console.log(err1234);
        }
        
        const colid1=parseInt(req.query.colid);
        const lcat1233= await Feedback.aggregate([
            { 
                $match: {colid: colid1, type: 'sss' }
            },
            { 
                $group: {
                    // _id:['$regno','$name'],
                    // _id:['$regno','$name'], 
                    _id: {                        
                        question: '$question'
                    },
                    total_attendance: {$avg: '$score'}
                }
            }
        ]);
        //console.log(lcat1233);
        return res.status(200).json({
            status:'Success',
            data: {
                classes : lcat1233
            }   
        });               
    } catch(err) {
       /*  res.status(400).json({
            status:'Failed',
            message: err
        }); */

    }  
};
