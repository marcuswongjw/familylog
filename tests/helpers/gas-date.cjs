// Supported subset of Java SimpleDateFormat used by the app. Unknown tokens fail loudly.
// https://developers.google.com/apps-script/reference/utilities/utilities#formatDate(Date,String,String)
function formatDate(value,zone,pattern){
 const date=new Date(value);if(!Number.isFinite(date.getTime()))throw Error('Invalid date');
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
 const hour=Number(parts.hour),named=options=>new Intl.DateTimeFormat('en-US',{timeZone:zone,...options}).format(date);
 const offset=Math.round((Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),hour,Number(parts.minute),Number(parts.second))-Math.floor(date.getTime()/1000)*1000)/60000);
 const tokens={yyyy:parts.year,MM:parts.month,MMM:named({month:'short'}),MMMM:named({month:'long'}),dd:parts.day,d:String(Number(parts.day)),EEEE:named({weekday:'long'}),EEE:named({weekday:'short'}),HH:parts.hour,H:String(hour),hh:String(hour%12||12).padStart(2,'0'),h:String(hour%12||12),mm:parts.minute,ss:parts.second,a:hour<12?'AM':'PM',Z:(offset<0?'-':'+')+String(Math.floor(Math.abs(offset)/60)).padStart(2,'0')+String(Math.abs(offset)%60).padStart(2,'0')};
 let output='',i=0;
 while(i<pattern.length){
  if(pattern[i]==="'"){
   if(pattern[i+1]==="'"){output+="'";i+=2;continue;}
   i++;let closed=false;
   while(i<pattern.length){if(pattern[i]==="'"){if(pattern[i+1]==="'"){output+="'";i+=2;}else{i++;closed=true;break;}}else output+=pattern[i++];}
   if(!closed)throw Error('Unterminated date literal');
  }else if(/[a-z]/i.test(pattern[i])){
   const match=pattern.slice(i).match(/^([a-zA-Z])\1*/)[0];if(!(match in tokens))throw Error('Unsupported date token: '+match);output+=tokens[match];i+=match.length;
  }else output+=pattern[i++];
 }
 return output;
}
module.exports={formatDate};
