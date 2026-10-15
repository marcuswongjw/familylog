const {buildBackend}=require('./backend-package.cjs');
function buildFamilyBackend(target){return buildBackend('family',target);}
if(require.main===module)buildFamilyBackend(process.argv[2]||'/tmp/wongs-nest-family-gas');
module.exports={buildFamilyBackend};
