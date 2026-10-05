const fs=require('node:fs'),path=require('node:path');
exports.readAppSource=()=>fs.readFileSync(path.resolve(__dirname,'../../js/app.js'),'utf8').replace(/    \/\/ MODULE:(\w+)\n/g,(_,name)=>fs.readFileSync(path.resolve(__dirname,'../../js/'+name+'.js'),'utf8'));
