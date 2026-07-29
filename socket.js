// socket.js
let io;
let _userConnections = [];
const onlineClassRooms = new Map();

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
            });

            // Example listener
            socket.on("joinRoom", (room) => {
                socket.join(room);
                console.log(`Socket ${socket.id} joined room ${room}`);
            });

            socket.on("online-class-join", (data = {}, callback = () => {}) => {
                const roomId = String(data.roomId || data.classId || "");
                if (!roomId) return callback({ success: false, message: "roomId is required" });
                const room = getOnlineRoom(roomId);
                const user = {
                    name: data.name || data.user || "User",
                    email: data.email || "",
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
                callback({
                    success: true,
                    socketId: socket.id,
                    participants: onlineClassParticipants(room).filter((item) => item.socketId !== socket.id),
                    permissions: room.permissions.get(socket.id)
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
