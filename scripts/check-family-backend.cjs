// No credentials or household records. Fail closed before enabling forwarding.
const config=require('./project-config.cjs').serviceConfig('family');
(async()=>{
 const response=await fetch(config.url+'?action=health',{signal:AbortSignal.timeout(45000)});
 let result;try{result=await response.json()}catch{throw Error('Google authorization is still required for the family web-app deployment. Live routing has not been activated.');}
 if(!response.ok||result.status!=='ready'||result.backend!=='family')throw Error('Family backend access check failed; do not activate live routing.');
 console.log('Family backend spreadsheet/calendar access verified.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
