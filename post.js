const http=require('http');
const data=JSON.stringify({author:'Tester',title:'Hello',content:'This is a test.'});
const req=http.request({hostname:'localhost',port:3000,path:'/forum/posts',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}},res=>{
  res.on('data',d=>process.stdout.write(d));
});
req.write(data);
req.end();
