// glitch script: randomly replace words in page with screaming text
const words = ['RUN','THEY SEE YOU','DON\'T BLINK','BEHIND','SCREAM'];
function glitchText() {
    document.querySelectorAll('p,h2,h3').forEach(el => {
        if(Math.random()>0.9) {
            el.textContent = words[Math.floor(Math.random()*words.length)];
        }
    });
}
setInterval(glitchText, 4000);

// spawn spectral image occasionally
function spawnGhost() {
    const img = document.createElement('img');
    img.src = '/images/ghost.png'; // put a transparent ghost there
    img.style.position = 'fixed';
    img.style.left = Math.random()*100 + '%';
    img.style.top = Math.random()*100 + '%';
    img.style.width = '100px';
    img.style.opacity = '0.2';
    img.style.pointerEvents = 'none';
    img.style.transition = 'opacity 5s linear, transform 5s linear';
    document.body.appendChild(img);
    setTimeout(() => {
        img.style.opacity = '0';
        img.style.transform = 'scale(2)';
        setTimeout(() => img.remove(), 5000);
    }, 100);
}
setInterval(spawnGhost, 7000);

// occasionally highlight a random nav item
function randomMenu() {
    const links = document.querySelectorAll('.sidebar nav a');
    if(links.length===0) return;
    const idx = Math.floor(Math.random()*links.length);
    const el = links[idx];
    const orig = el.style.color;
    el.style.color = 'red';
    setTimeout(()=>{el.style.color=orig;}, 2000);
}
setInterval(randomMenu, 10000);
