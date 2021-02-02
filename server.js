const { v4: uuidV4 } = require('uuid')
const express = require('express')
const app = express()
const fs = require('fs')
const https = require('https')
///const http = require('http')
const options = {
  key:fs.readFileSync('client-1.local.key'),
  cert: fs.readFileSync('client-1.local.crt')
}
const httpsServer = https.createServer(options, app)
//const httpServer = http.createServer(app)
const io = require('socket.io')(httpsServer)

app.set('view engine', 'ejs')
app.use(express.static('public'))

app.get('/', (req, res) => {
  res.redirect(`/${uuidV4()}`)
})

app.get('/:room', (req, res) => {
  res.render('room', { roomId: req.params.room })
})

io.on('connection', socket => {
  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId)
    socket.to(roomId).broadcast.emit('user-connected', userId)

    socket.on('disconnect', () => {
      socket.to(roomId).broadcast.emit('user-disconnected', userId)
    })
  })
})

httpsServer.listen(3000, function () {
    console.log("Example app listening at https://%s:%s", httpsServer.address().address, httpsServer.address().port);
  });
