/* Original Wong’s Nest companion illustrations. Vector art stays crisp on phones. */
function rewardCompanionSVG(profile, size = 'large') {
  const species = profile.species;
  const palettes = { fox: ['#BA7B68', '#FFF5E7'], rabbit: ['#D6C5B3', '#FFF5E7'], bear: ['#B58E67', '#E9D8BD'], cat: ['#A4B397', '#FFF5E7'], turtle: ['#8EAA79', '#E8DDB6'], dolphin: ['#8EB6C6', '#E7F3F5'], penguin: ['#667886', '#FFF5E7'], otter: ['#A88165', '#EEDAC1'] };
  const [coat, muzzle] = palettes[species] || palettes.fox;
  const ears = species === 'rabbit'
    ? '<ellipse cx="65" cy="42" rx="14" ry="34"/><ellipse cx="116" cy="42" rx="14" ry="34"/><g fill="#D59B9C"><ellipse cx="65" cy="42" rx="6" ry="23"/><ellipse cx="116" cy="42" rx="6" ry="23"/></g>'
    : species === 'bear' ? '<circle cx="49" cy="53" r="20"/><circle cx="131" cy="53" r="20"/><g fill="' + muzzle + '"><circle cx="49" cy="53" r="11"/><circle cx="131" cy="53" r="11"/></g>'
    : '<path d="M40 69 43 23 77 48ZM102 48 137 23 140 69Z"/><g fill="' + muzzle + '"><path d="M48 57 49 34 67 49ZM113 49 132 34 132 57Z"/></g>';
  const specialBody = {
    turtle: `<g fill="${coat}"><ellipse cx="49" cy="141" rx="18" ry="11" transform="rotate(-28 49 141)"/><ellipse cx="131" cy="141" rx="18" ry="11" transform="rotate(28 131 141)"/><ellipse cx="60" cy="165" rx="18" ry="10"/><ellipse cx="120" cy="165" rx="18" ry="10"/></g><ellipse cx="90" cy="133" rx="43" ry="38" fill="#647D54"/><path d="m90 101-22 17v25l22 18 22-18v-25Zm-22 17-16-5m16 30-17 8m61-33 16-5m-16 30 17 8" fill="none" stroke="#9BB582" stroke-width="3"/><ellipse cx="90" cy="78" rx="50" ry="43" fill="${coat}"/>`,
    dolphin: `<g fill="${coat}"><path d="M64 125Q31 119 30 145Q51 147 66 139ZM116 125Q149 119 150 145Q129 147 114 139Z"/><path d="M75 156Q61 150 45 170Q68 179 90 164Q112 179 135 170Q119 150 105 156Z"/><ellipse cx="90" cy="132" rx="34" ry="35"/><path d="M75 43Q87 13 101 32L114 51Z"/><ellipse cx="90" cy="78" rx="53" ry="43"/></g>`,
    penguin: `<g fill="${coat}"><ellipse cx="90" cy="127" rx="42" ry="44"/><path d="M52 112Q22 131 36 151L60 133ZM128 112Q158 131 144 151L120 133Z"/><ellipse cx="90" cy="78" rx="51" ry="46"/></g><g fill="#D5A059"><ellipse cx="64" cy="169" rx="19" ry="8"/><ellipse cx="116" cy="169" rx="19" ry="8"/></g><path d="M44 80Q47 47 65 52Q80 51 90 69Q100 51 115 52Q133 47 136 80L127 105H53Z" fill="${muzzle}"/>`,
    otter: `<path d="M117 147Q161 154 154 173Q132 179 110 166" fill="${coat}"/><g fill="${coat}"><circle cx="46" cy="53" r="14"/><circle cx="134" cy="53" r="14"/><ellipse cx="90" cy="132" rx="37" ry="39"/><ellipse cx="62" cy="163" rx="16" ry="10"/><ellipse cx="118" cy="163" rx="16" ry="10"/><ellipse cx="90" cy="78" rx="54" ry="44"/></g><g fill="${muzzle}"><circle cx="46" cy="53" r="7"/><circle cx="134" cy="53" r="7"/></g>`
  }[species];
  const accessory = {
    'life-jacket': '<g fill="#E6A45D" stroke="#B6783D" stroke-width="2"><path d="M58 117 76 111 84 128v33H58ZM122 117 104 111 96 128v33h26Z"/><path d="M58 140h64m-64 13h64" stroke="#665080" stroke-width="5"/><rect x="85" y="136" width="10" height="8" rx="2" fill="#FFF5E7"/></g>',
    sunhat: '<g fill="#E4BF68"><path d="M57 51Q60 15 90 15Q120 15 123 51Z"/><ellipse cx="90" cy="52" rx="58" ry="9"/><path d="M60 40h60" stroke="#A87557" stroke-width="8"/></g>',
    scarf: '<g fill="#779C96"><path d="M49 112Q90 130 131 112L126 129Q90 142 54 129Z"/><path d="M109 125h17v35h-17Z"/></g>',
    crown: '<path d="M52 48 47 20 72 33 90 10 109 33 134 20 127 48Z" fill="#E5BD55" stroke="#B88B35" stroke-width="2"/>',
    flower: '<g fill="#D59B9C"><circle cx="126" cy="35" r="10"/><circle cx="140" cy="46" r="10"/><circle cx="130" cy="60" r="10"/><circle cx="114" cy="50" r="10"/><circle cx="127" cy="47" r="7" fill="#E5BD55"/></g>',
    cape: '<path d="M49 111 28 170Q90 155 152 170L131 111Z" fill="#9C83B6"/>',
    'party-hat': '<g><path d="M65 47 90 0 115 47Z" fill="#779C96"/><path d="m78 24 22 9M71 37l35 6" stroke="#E5BD55" stroke-width="5"/><circle cx="90" cy="3" r="5" fill="#D59B9C"/></g>',
    glasses: '<g stroke="#665080" stroke-width="4" fill="none"><circle cx="65" cy="82" r="16"/><circle cx="115" cy="82" r="16"/><path d="M81 82Q90 76 99 82M44 78 49 80M131 80 137 78"/></g>',
    'sailing-cap': '<g><path d="M53 52Q90 4 129 52Z" fill="#6F9893"/><path d="M48 50Q90 38 137 51L141 60H43Z" fill="#665080"/><path d="M90 29v13m-6-6h12" stroke="#FFF5E7" stroke-width="3"/></g>',
    'ballet-bow': '<g fill="#D59B9C" stroke="#755766" stroke-width="2"><path d="M104 45Q94 26 80 31L83 52Q96 52 104 45ZM104 45Q115 23 132 30L128 51Q112 54 104 45Z"/><circle cx="104" cy="44" r="7"/></g>',
    backpack: '<g><path d="M47 128Q60 115 66 129L64 154H43Z" fill="#C89B4A"/><path d="M47 129Q40 103 60 104" stroke="#C89B4A" stroke-width="7" fill="none"/><path d="M46 137h15" stroke="#FFF5E7" stroke-width="3"/></g>'
  }[profile.equipped] || '';
  return `<svg class="reward-companion reward-companion-${size}" viewBox="0 0 180 190" role="img" aria-label="${escapeHtml(profile.name)} the ${escapeHtml(species)}${profile.equipped ? ', wearing an accessory' : ''}">
    <ellipse cx="90" cy="174" rx="46" ry="7" fill="var(--primary)" opacity=".09"/>
    <g class="reward-character">${specialBody || `<g fill="${coat}">${ears}<ellipse cx="90" cy="132" rx="40" ry="39"/><ellipse cx="60" cy="161" rx="18" ry="12"/><ellipse cx="120" cy="161" rx="18" ry="12"/><ellipse cx="90" cy="78" rx="54" ry="45"/></g>`}
      ${species==='turtle'?'':`<ellipse cx="90" cy="137" rx="25" ry="24" fill="${muzzle}"/>`}<path d="M44 84Q65 91 90 100Q115 90 136 84Q127 122 90 121Q53 122 44 84Z" fill="${muzzle}"/>
      <g class="reward-eyes" fill="#34303D"><ellipse cx="65" cy="80" rx="4" ry="6"/><ellipse cx="115" cy="80" rx="4" ry="6"/></g>
      <g fill="#D59B9C" opacity=".6"><ellipse cx="52" cy="96" rx="9" ry="5"/><ellipse cx="128" cy="96" rx="9" ry="5"/></g>
      ${species==='dolphin'?'<ellipse cx="90" cy="105" rx="22" ry="9" fill="#E7F3F5"/>':''}
      <path d="M85 97Q90 94 95 97L90 103Z" fill="${species==='penguin'?'#D5A059':'#34303D'}"/><path d="M90 103v6m-8-3q8 10 16 0" stroke="#34303D" stroke-width="2.5" stroke-linecap="round" fill="none"/>
      <path d="M55 127q-17 2-17 17m87-17q17 2 17 17" stroke="${coat}" stroke-width="13" stroke-linecap="round" fill="none"/>${species==='otter'?'<path d="m53 102-17-4m17 10-17 3m91-9 17-4m-17 10 17 3" stroke="#755B48" stroke-width="2"/>':''}${accessory}
    </g></svg>`;
}
function rewardHomeSVG(unlocked) {
  return `<svg class="reward-home-scene" viewBox="0 0 520 215" role="img" aria-label="A cozy family home${unlocked ? ' with an unlocked flower garden' : ' waiting for its flower garden'}">
    <ellipse cx="260" cy="187" rx="229" ry="24" fill="#A4B397" opacity=".25"/>
    <g><circle cx="82" cy="93" r="31" fill="#A4B397"/><circle cx="64" cy="109" r="28" fill="#A4B397"/><circle cx="103" cy="113" r="29" fill="#A4B397"/><path d="M83 110v73m0-35-16-17m16 28 17-19" stroke="#6F7861" stroke-width="7" stroke-linecap="round"/></g>
    <path d="M174 95h176v90H174Z" fill="#E9D8BD"/><path d="M160 98 260 27 365 98Z" fill="#BA7B68"/><path d="M317 64V36h17v39" fill="#BA7B68"/>
    <path d="M239 185v-45q0-25 25-25t25 25v45" fill="#665080"/><circle cx="277" cy="150" r="3" fill="#C89B4A"/>
    <g fill="#FFF5E7" stroke="#B58E67" stroke-width="4"><rect x="193" y="115" width="27" height="29" rx="5"/><rect x="309" y="115" width="27" height="29" rx="5"/></g>
    <path d="M206 115v29m-13-15h27m102-14v29m-13-15h27" stroke="#B58E67" stroke-width="3"/>
    <path d="M249 185q-8 10-17 16h65q-15-10-21-16" fill="#D6C5B3"/>
    <g fill="#A4B397"><ellipse cx="166" cy="181" rx="31" ry="11"/><ellipse cx="354" cy="181" rx="25" ry="11"/></g>
    ${unlocked ? '<g stroke="#6F7861" stroke-width="3"><path d="M396 183v-29m22 33v-21m-48 16v-22"/></g><g fill="#D59B9C"><circle cx="396" cy="150" r="10"/><circle cx="418" cy="163" r="8"/></g><circle cx="370" cy="157" r="9" fill="#C89B4A"/><g fill="#FFF5E7"><circle cx="396" cy="150" r="3"/><circle cx="418" cy="163" r="3"/><circle cx="370" cy="157" r="3"/></g>' : '<path d="M368 182h68" stroke="#A4B397" stroke-width="4" stroke-linecap="round" stroke-dasharray="4 7"/>'}
  </svg>`;
}
