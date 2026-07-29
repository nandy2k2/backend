// socket.js
const NepLmsTimetable = require("./Models/neplmstimetableds");
const NepLmsAttendance = require("./Models/neplmsattendanceds");
const NepLmsOnlineClassJoin = require("./Models/neplmsonlineclassjoinds");
const LiveMeeting = require("./Models/livemeetingds");
const User = require("./Models/user");

let io;
let _userConnections = [];
const onlineClassRooms = new Map();
const liveMeetingRooms = new Map();
const text = (value) => String(value || "").trim();
const number = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};
const todayText = () => new Date().toISOString().slice(0, 10);
const timeText = () => new Date().toLocaleTimeString("en-IN", { hour12: false, timeZone: "Asia/Kolkata" });

const getOnlineRoom = (roomId) => {
    const key = String(roomId || "");
    if (!onlineClassRooms.has(key)) {
        onlineClassRooms.set(key, { participants: new Map(), permissions: new Map() });
    }
    return onlineClassRooms.get(key);
};

const onlineClassParticipants = (room) => Array.from(room.participants.entries()).map(([socketId, user]) => ({
    socketId,
    ...user
}));

const getLiveMeetingRoom = (roomId) => {
    const key = String(roomId || "");
    if (!liveMeetingRooms.has(key)) {
        liveMeetingRooms.set(key, { participants: new Map(), waiting: new Map() });
    }
    return liveMeetingRooms.get(key);
};

const liveMeetingParticipants = (room) => Array.from(room.participants.entries()).map(([socketId, user]) => ({
    socketId,
    ...user
}));

const liveMeetingWaiting = (room) => Array.from(room.waiting.entries()).map(([socketId, user]) => ({
    socketId,
    ...user
}));

const markOnlineClassAttendance = async ({ roomId, socketId, user }) => {
    let colid = number(user.colid);
    if (!roomId || String(user.role || "").toLowerCase() === "faculty") return null;

    const classInfo = colid
        ? await NepLmsTimetable.findOne({ _id: roomId, colid }).lean()
        : await NepLmsTimetable.findOne({ _id: roomId }).lean();
    if (!classInfo) return null;
    colid = colid || number(classInfo.colid);
    if (!colid) return null;

    const studentQuery = { colid, role: /^Student$/i };
    const or = [];
    if (text(user.regno)) or.push({ regno: text(user.regno) });
    if (text(user.email)) or.push({ email: new RegExp(`^${text(user.email).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
    if (or.length) studentQuery.$or = or;
    if (!or.length) return null;

    const student = await User.findOne(studentQuery).lean();
    if (!student?._id) return null;

    const attendancePayload = {
        classid: classInfo._id,
        studentid: student._id,
        student: text(student.name),
        studentemail: text(student.email),
        studentphone: text(student.phone),
        regno: text(student.regno),
        rollno: text(student.rollno),
        program: text(classInfo.program || student.program),
        programcode: text(classInfo.programcode || student.programcode),
        academicyear: text(classInfo.academicyear || student.academicyear),
        semester: text(classInfo.semester || student.semester),
        section: text(classInfo.section || student.section),
        classgroup: text(classInfo.classgroup),
        enrollmentgroup: text(classInfo.enrollmentgroup),
        enrollmentgroupid: classInfo.enrollmentgroupid || undefined,
        specialization: text(classInfo.specialization || student.specialization),
        major: text(classInfo.major || student.Major),
        faculty: text(classInfo.faculty),
        facultyemail: text(classInfo.facultyemail),
        course: text(classInfo.course),
        coursecode: text(classInfo.coursecode),
        classdate: text(classInfo.classdate),
        classtime: text(classInfo.classtime),
        attendance: 1,
        type: "Regular",
        comments: "Marked present from online class join",
        colid,
        user: text(user.email)
    };

    const attendance = await NepLmsAttendance.findOneAndUpdate(
        { colid, classid: classInfo._id, studentid: student._id, type: "Regular" },
        attendancePayload,
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await NepLmsOnlineClassJoin.findOneAndUpdate(
        { colid, classid: classInfo._id, studentid: student._id },
        {
            $set: {
                ...attendancePayload,
                regulation: text(classInfo.regulation || student.regulation),
                joindate: todayText(),
                jointime: timeText(),
                lastjoinedat: new Date(),
                attendanceid: attendance._id,
                socketid: socketId,
                source: "Online Class"
            },
            $inc: { joincount: 1 }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return attendance;
};

module.exports = {
    init: (httpServer) => {
        io = require("socket.io")(httpServer, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        var usernames = [];

        io.on("connection", (socket) => {
            //console.log("New client connected:", socket.id);

            socket.on("disconnect", () => {
               // console.log("Client disconnected:", socket.id);
               onlineClassRooms.forEach((room, roomId) => {
                if (room.participants.has(socket.id)) {
                    room.participants.delete(socket.id);
                    room.permissions.delete(socket.id);
                    socket.to(roomId).emit("online-class-user-left", { socketId: socket.id });
                }
                if (!room.participants.size) onlineClassRooms.delete(roomId);
               });
               liveMeetingRooms.forEach((room, roomId) => {
                if (room.participants.has(socket.id)) {
                    room.participants.delete(socket.id);
                    socket.to(`live-meeting-${roomId}`).emit("live-meeting-user-left", { socketId: socket.id });
                }
                if (room.waiting.has(socket.id)) {
                    room.waiting.delete(socket.id);
                    socket.to(`live-meeting-${roomId}`).emit("live-meeting-waiting-list", liveMeetingWaiting(room));
                }
                if (!room.participants.size && !room.waiting.size) liveMeetingRooms.delete(roomId);
               });
            });

            // Example listener
            socket.on("joinRoom", (room) => {
                socket.join(room);
                console.log(`Socket ${socket.id} joined room ${room}`);
            });

            socket.on("online-class-join", async (data = {}, callback = () => {}) => {
                const roomId = String(data.roomId || data.classId || "");
                if (!roomId) return callback({ success: false, message: "roomId is required" });
                const room = getOnlineRoom(roomId);
                const user = {
                    name: data.name || data.user || "User",
                    email: data.email || "",
                    regno: data.regno || "",
                    colid: data.colid || "",
                    role: data.role || "student",
                    canShareAudio: data.role === "faculty",
                    canShareCamera: data.role === "faculty",
                    canShareScreen: data.role === "faculty"
                };
                room.participants.set(socket.id, user);
                room.permissions.set(socket.id, {
                    audio: user.canShareAudio,
                    camera: user.canShareCamera,
                    screen: user.canShareScreen
                });
                socket.join(roomId);
                let attendanceMarked = false;
                try {
                    attendanceMarked = Boolean(await markOnlineClassAttendance({ roomId, socketId: socket.id, user }));
                } catch (error) {
                    console.error("Unable to mark online class attendance:", error.message);
                }
                callback({
                    success: true,
                    socketId: socket.id,
                    participants: onlineClassParticipants(room).filter((item) => item.socketId !== socket.id),
                    permissions: room.permissions.get(socket.id),
                    attendanceMarked
                });
                socket.to(roomId).emit("online-class-user-joined", {
                    socketId: socket.id,
                    user,
                    participants: onlineClassParticipants(room)
                });
                io.to(roomId).emit("online-class-participants", onlineClassParticipants(room));
            });

            socket.on("online-class-signal", (data = {}) => {
                if (!data.to) return;
                socket.to(data.to).emit("online-class-signal", {
                    from: socket.id,
                    signal: data.signal
                });
            });

            socket.on("online-class-permission-request", (data = {}) => {
                const roomId = String(data.roomId || "");
                const room = onlineClassRooms.get(roomId);
                if (!room) return;
                const faculty = onlineClassParticipants(room).find((item) => String(item.role || "").toLowerCase() === "faculty");
                if (faculty?.socketId) {
                    socket.to(faculty.socketId).emit("online-class-permission-request", {
                        from: socket.id,
                        request: data.request || {},
                        user: room.participants.get(socket.id)
                    });
                }
            });

            socket.on("online-class-permission-grant", (data = {}) => {
                const roomId = String(data.roomId || "");
                const room = onlineClassRooms.get(roomId);
                if (!room || !data.to) return;
                const nextPermission = {
                    ...(room.permissions.get(data.to) || {}),
                    ...(data.permissions || {})
                };
                room.permissions.set(data.to, nextPermission);
                socket.to(data.to).emit("online-class-permission-grant", {
                    permissions: nextPermission
                });
            });

            socket.on("online-class-mute", (data = {}) => {
                if (!data.to) return;
                socket.to(data.to).emit("online-class-mute", {
                    audio: data.audio !== false,
                    camera: data.camera === true,
                    screen: data.screen === true
                });
            });

            socket.on("live-meeting-join", async (data = {}, callback = () => {}) => {
                try {
                    const meetingId = String(data.meetingId || data.roomId || "");
                    if (!meetingId) return callback({ success: false, message: "meetingId is required" });
                    const meeting = await LiveMeeting.findById(meetingId).lean();
                    if (!meeting) return callback({ success: false, message: "Meeting not found" });
                    const room = getLiveMeetingRoom(meetingId);
                    const email = text(data.email).toLowerCase();
                    const user = {
                        name: text(data.name || data.user) || "Guest",
                        email,
                        role: data.external ? "external" : "internal",
                        external: Boolean(data.external),
                        host: String(email).toLowerCase() === String(meeting.hostEmail || "").toLowerCase(),
                        token: text(data.token)
                    };
                    const tokenOk = !user.external || user.token === meeting.publicJoinToken;
                    if (user.external && !tokenOk) return callback({ success: false, message: "Invalid external meeting link" });

                    socket.join(`live-meeting-${meetingId}`);
                    if (user.external && !user.host) {
                        room.waiting.set(socket.id, user);
                        callback({ success: true, waiting: true, socketId: socket.id, message: "Waiting for host approval" });
                        const hosts = liveMeetingParticipants(room).filter((item) => item.host);
                        hosts.forEach((host) => socket.to(host.socketId).emit("live-meeting-lobby-request", { socketId: socket.id, user }));
                        io.to(`live-meeting-${meetingId}`).emit("live-meeting-waiting-list", liveMeetingWaiting(room));
                        return;
                    }

                    room.participants.set(socket.id, user);
                    callback({
                        success: true,
                        waiting: false,
                        socketId: socket.id,
                        meeting,
                        participants: liveMeetingParticipants(room).filter((item) => item.socketId !== socket.id),
                        waitingList: liveMeetingWaiting(room)
                    });
                    socket.to(`live-meeting-${meetingId}`).emit("live-meeting-user-joined", { socketId: socket.id, user });
                    io.to(`live-meeting-${meetingId}`).emit("live-meeting-participants", liveMeetingParticipants(room));
                    io.to(`live-meeting-${meetingId}`).emit("live-meeting-waiting-list", liveMeetingWaiting(room));
                } catch (error) {
                    callback({ success: false, message: error.message });
                }
            });

            socket.on("live-meeting-admit", (data = {}) => {
                const meetingId = String(data.meetingId || "");
                const room = liveMeetingRooms.get(meetingId);
                if (!room || !data.to) return;
                const host = room.participants.get(socket.id);
                if (!host?.host) return;
                const user = room.waiting.get(data.to);
                if (!user) return;
                room.waiting.delete(data.to);
                room.participants.set(data.to, user);
                socket.emit("live-meeting-user-joined", { socketId: data.to, user });
                socket.to(data.to).emit("live-meeting-admitted", {
                    meetingId,
                    participants: liveMeetingParticipants(room).filter((item) => item.socketId !== data.to)
                });
                socket.to(`live-meeting-${meetingId}`).emit("live-meeting-user-joined", { socketId: data.to, user });
                io.to(`live-meeting-${meetingId}`).emit("live-meeting-participants", liveMeetingParticipants(room));
                io.to(`live-meeting-${meetingId}`).emit("live-meeting-waiting-list", liveMeetingWaiting(room));
            });

            socket.on("live-meeting-deny", (data = {}) => {
                const meetingId = String(data.meetingId || "");
                const room = liveMeetingRooms.get(meetingId);
                if (!room || !data.to) return;
                const host = room.participants.get(socket.id);
                if (!host?.host) return;
                room.waiting.delete(data.to);
                socket.to(data.to).emit("live-meeting-denied", { message: "Host did not allow entry" });
                io.to(`live-meeting-${meetingId}`).emit("live-meeting-waiting-list", liveMeetingWaiting(room));
            });

            socket.on("live-meeting-signal", (data = {}) => {
                if (!data.to) return;
                socket.to(data.to).emit("live-meeting-signal", {
                    from: socket.id,
                    signal: data.signal
                });
            });

            socket.on("live-meeting-mute", (data = {}) => {
                if (!data.to) return;
                socket.to(data.to).emit("live-meeting-mute", {
                    audio: data.audio !== false,
                    camera: data.camera === true,
                    screen: data.screen === true
                });
            });

            var un="";
        var room="";

    socket.on('new user', function(data, callback){
        //console.log(data);
        var res = data.split("-");
        un=res[0];
        room=res[1];
        //console.log("un " + un + " room " + room)
        //socket.join(room);
		//socket.username = un;
        callback(true);
            socket.join(room);
			socket.username = data;
			////usernames.push(socket.username);
			updateUsernames();
		// if(usernames.indexOf(data) != -1){
		// 	callback(false);
		// } else {
		// 	callback(true);
        //     socket.join(room);
		// 	socket.username = data;
		// 	usernames.push(socket.username);
		// 	updateUsernames();
		// }
	});

	// Update Usernames
	function updateUsernames(){
		//io.sockets.emit('usernames', usernames);
        io.sockets.emit('usernames', 'hello');
	}

	// Send Message
	socket.on('send message', function(data){
		//io.sockets.emit('new message', {msg: data, user:socket.username});
        io.sockets.in(room).emit('new message', {msg: data, user:socket.username});
	});

  // Send Message
	socket.on('drawing', function(data){
		//io.sockets.emit('new message', {msg: data, user:socket.username});
        io.sockets.in(room).emit('drawing', data);
	});

  socket.on('lock', function(data){
		//io.sockets.emit('new message', {msg: data, user:socket.username});
        io.sockets.in(room).emit('lock', data);
	});

  socket.on('lockc', function(data){
		//io.sockets.emit('new message', {msg: data, user:socket.username});
        io.sockets.in(room).emit('lockc', data);
	});

  socket.on('addProduct', function(data){
		//io.sockets.emit('new message', {msg: data, user:socket.username});
        //io.sockets.in(room).emit('lockc', data);
        //console.log(data);
        //console.log(data.price);
        var price=parseInt(data.price) -1;
        io.sockets.emit('getmessage', {message: price, item :'test'});


	});

    socket.on('mjournal2', function(data){
        //console.log(data);
        //var price=parseInt(data.price) -1;
        io.sockets.emit('mjournal2', {message: 'refresh journal', item :'test'});
	});


  socket.on('users_info_to_signaling_server', (data) => {
    //console.log('userconnect', data.current_user_name, data.meetingid);
    var other_users = _userConnections.filter(p => p.meeting_id == data.meetingid);
    _userConnections.push({
        connectionId: socket.id,
        user_id: data.current_user_name,
        meeting_id: data.meetingid
    });
    //console.log(`all users: ${_userConnections.map(a => a.connectionId)}`);
    //        console.log(_userConnections);
    //console.log(`other users: ${other_users.map(a => a.connectionId)}`);
    //console.log(`connection id: ${connectionId} socket id:${socket.id}`);

    other_users.forEach(v => {
        socket.to(v.connectionId).emit('newConnectionInformation', {
            other_user_id: data.current_user_name,
            connId: socket.id
        });
    });

    socket.emit('other_users_to_inform', other_users);



    //        _userConnections[0].meeting_id
})

socket.on('exchangeSDP', (data) => {

    socket.to(data.to_connid).emit('exchangeSDP', {
        message: data.message,
        from_connid: socket.id
    });

}); //end of exchangeSDP
socket.on('reset', (data) => {
    var userObj = _userConnections.find(p => p.connectionId == socket.id);
    if (userObj) {
        var meetingid = userObj.meeting_id;
        var list = _userConnections.filter(p => p.meeting_id == meetingid);
        _userConnections = _userConnections.filter(p => p.meeting_id != meetingid);

        list.forEach(v => {
            socket.to(v.connectionId).emit('reset');
        });

        socket.emit('reset');
    }

}); //end of reset


	// Disconnect
	// socket.on('disconnect', function(data){
    //     var userObj = _userConnections.find(p => p.connectionId == socket.id);
    //     if (userObj) {
    //         var meetingid = userObj.meeting_id;

    //         _userConnections = _userConnections.filter(p => p.connectionId != socket.id);
    //         var list = _userConnections.filter(p => p.meeting_id == meetingid);
    //         //console.log(`disconnected socket id   ${socket.id}`);
    //         //console.log(`connection id: ${connectionId} socket id:${socket.id}`);
    //         list.forEach(v => {
    //             socket.to(v.connectionId).emit('informAboutConnectionEnd', socket.id);
    //         });
    //     }
	// 	if(!socket.username){
	// 		return;
	// 	}

	// 	    usernames.splice(usernames.indexOf(socket.username), 1);
	// 	    updateUsernames();
	//     });





        });

        return io;
    },

    getIO: () => {
        if (!io) {
            throw new Error("Socket.io not initialized!");
        }
        return io;
    }
};
