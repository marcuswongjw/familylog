/* Original Wong’s Nest companion illustrations. Vector art stays crisp on phones. */
function rewardCompanionSVG(profile, size = 'large') {
  const species = profile.species;
  const palettes = { fox: ['#BA7B68', '#FFF5E7'], rabbit: ['#D6C5B3', '#FFF5E7'], bear: ['#B58E67', '#E9D8BD'], cat: ['#A4B397', '#FFF5E7'] };
  const [coat, muzzle] = palettes[species] || palettes.fox;
  const ears = species === 'rabbit'
    ? '<ellipse cx="65" cy="42" rx="14" ry="34"/><ellipse cx="116" cy="42" rx="14" ry="34"/><g fill="#D59B9C"><ellipse cx="65" cy="42" rx="6" ry="23"/><ellipse cx="116" cy="42" rx="6" ry="23"/></g>'
    : species === 'bear' ? '<circle cx="49" cy="53" r="20"/><circle cx="131" cy="53" r="20"/><g fill="' + muzzle + '"><circle cx="49" cy="53" r="11"/><circle cx="131" cy="53" r="11"/></g>'
    : '<path d="M40 69 43 23 77 48ZM102 48 137 23 140 69Z"/><g fill="' + muzzle + '"><path d="M48 57 49 34 67 49ZM113 49 132 34 132 57Z"/></g>';
  const accessory = {
    glasses: '<g stroke="#665080" stroke-width="4" fill="none"><circle cx="65" cy="82" r="16"/><circle cx="115" cy="82" r="16"/><path d="M81 82Q90 76 99 82M44 78 49 80M131 80 137 78"/></g>',
    'sailing-cap': '<g><path d="M53 52Q90 4 129 52Z" fill="#6F9893"/><path d="M48 50Q90 38 137 51L141 60H43Z" fill="#665080"/><path d="M90 29v13m-6-6h12" stroke="#FFF5E7" stroke-width="3"/></g>',
    'ballet-bow': '<g fill="#D59B9C" stroke="#755766" stroke-width="2"><path d="M104 45Q94 26 80 31L83 52Q96 52 104 45ZM104 45Q115 23 132 30L128 51Q112 54 104 45Z"/><circle cx="104" cy="44" r="7"/></g>',
    backpack: '<g><path d="M47 128Q60 115 66 129L64 154H43Z" fill="#C89B4A"/><path d="M47 129Q40 103 60 104" stroke="#C89B4A" stroke-width="7" fill="none"/><path d="M46 137h15" stroke="#FFF5E7" stroke-width="3"/></g>'
  }[profile.equipped] || '';
  return `<svg class="reward-companion reward-companion-${size}" viewBox="0 0 180 190" role="img" aria-label="${escapeHtml(profile.name)} the ${escapeHtml(species)}${profile.equipped ? ', wearing an accessory' : ''}">
    <ellipse cx="90" cy="174" rx="46" ry="7" fill="var(--primary)" opacity=".09"/>
    <g class="reward-character"><g fill="${coat}">${ears}<ellipse cx="90" cy="132" rx="40" ry="39"/><ellipse cx="60" cy="161" rx="18" ry="12"/><ellipse cx="120" cy="161" rx="18" ry="12"/><ellipse cx="90" cy="78" rx="54" ry="45"/></g>
      <ellipse cx="90" cy="137" rx="25" ry="24" fill="${muzzle}"/><path d="M44 84Q65 91 90 100Q115 90 136 84Q127 122 90 121Q53 122 44 84Z" fill="${muzzle}"/>
      <g class="reward-eyes" fill="#34303D"><ellipse cx="65" cy="80" rx="4" ry="6"/><ellipse cx="115" cy="80" rx="4" ry="6"/></g>
      <g fill="#D59B9C" opacity=".6"><ellipse cx="52" cy="96" rx="9" ry="5"/><ellipse cx="128" cy="96" rx="9" ry="5"/></g>
      <path d="M85 97Q90 94 95 97L90 103Z" fill="#34303D"/><path d="M90 103v6m-8-3q8 10 16 0" stroke="#34303D" stroke-width="2.5" stroke-linecap="round" fill="none"/>
      <path d="M55 127q-17 2-17 17m87-17q17 2 17 17" stroke="${coat}" stroke-width="13" stroke-linecap="round" fill="none"/>${accessory}
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
