'use strict';
// Read a downloaded Loading check or exported Apps Script/Cloud Logging JSON(L).
// Output is a numeric aggregate; arbitrary input fields are discarded.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {cleanNestSample,nestPerformanceSummary}=require('../js/performance.js');
function extract(value){
 if(Array.isArray(value))return value.flatMap(extract);
 if(!value||typeof value!=='object')return [];
 if(Array.isArray(value.samples))return value.samples.flatMap(sample=>{const clean=cleanNestSample(sample,sample.source);return clean?[clean]:[];});
 if(value.event==='nest.performance'){const clean=cleanNestSample(value,'server');return clean?[clean]:[];}
 for(const key of ['jsonPayload','textPayload','message']){const item=value[key];if(typeof item==='string'){try{return extract(JSON.parse(item));}catch(_){}}else if(item&&typeof item==='object')return extract(item);}
 return [];
}
function readSamples(text){try{return extract(JSON.parse(text));}catch(_){return text.split(/\r?\n/).flatMap(line=>{try{return extract(JSON.parse(line));}catch(_){return [];}});}}
function assetSizes(root=path.resolve(__dirname,'..')){
 const sizes=files=>{let raw=0,gzip=0;for(const file of files){const bytes=fs.readFileSync(path.join(root,file));raw+=bytes.length;gzip+=zlib.gzipSync(bytes).length;}return {files:files.length,rawBytes:raw,gzipBytes:gzip};};
 return {appJavaScript:sizes(fs.readdirSync(path.join(root,'js')).filter(n=>n.endsWith('.js')).map(n=>'js/'+n)),styles:sizes(fs.readdirSync(path.join(root,'css')).filter(n=>n.endsWith('.css')).map(n=>'css/'+n)),firebaseSdk:sizes(fs.readdirSync(path.join(root,'assets')).filter(n=>/^firebase-.*[.]js$/.test(n)).map(n=>'assets/'+n))};
}
if(require.main===module){
 const file=process.argv[2];
 if(!file){process.stdout.write(JSON.stringify({assets:assetSizes(),note:'Pass a Loading check JSON or Apps Script timing JSONL export for measured percentiles. Asset sizes are not loading-time measurements.'},null,2)+'\n');}
 else {if(fs.statSync(file).size>20*1024*1024)throw Error('Use a timing export smaller than 20 MiB.');const samples=readSamples(fs.readFileSync(file,'utf8'));if(!samples.length)throw Error('No timing samples found.');process.stdout.write(JSON.stringify({sampleCount:samples.length,summary:nestPerformanceSummary(samples),assets:assetSizes()},null,2)+'\n');}
}
module.exports={readSamples,assetSizes};
