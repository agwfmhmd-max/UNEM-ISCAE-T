
        /* مقدمة الدخول: تظهر عند كل دخول جديد للصفحة وتغلق تلقائياً بعد ثوانٍ */
        (function(){
            let welcomeSplashTimer;
            window.dismissWelcomeSplash = function(){
                const splash=document.getElementById('welcome-splash');
                if(!splash || splash.classList.contains('is-hidden')) return;
                clearTimeout(welcomeSplashTimer);
                splash.classList.add('is-hidden');
                window.setTimeout(function(){ splash.remove(); }, 650);
            };
            function playWelcomeSound(){
                try{
                    const AudioContext=window.AudioContext||window.webkitAudioContext;
                    if(!AudioContext || window.__unemWelcomeSoundPlayed) return;
                    const ctx=new AudioContext();
                    const play=function(){
                        if(window.__unemWelcomeSoundPlayed) return;
                        window.__unemWelcomeSoundPlayed=true;
                        const now=ctx.currentTime;
                        const master=ctx.createGain();
                        master.gain.setValueAtTime(0.0001,now);
                        master.gain.exponentialRampToValueAtTime(0.075,now+0.06);
                        master.gain.exponentialRampToValueAtTime(0.0001,now+1.45);
                        master.connect(ctx.destination);
                        [[523.25,0],[659.25,.18],[783.99,.36]].forEach(function(note){
                            const osc=ctx.createOscillator();
                            const gain=ctx.createGain();
                            osc.type='sine'; osc.frequency.value=note[0];
                            gain.gain.setValueAtTime(0.0001,now+note[1]);
                            gain.gain.exponentialRampToValueAtTime(0.34,now+note[1]+.08);
                            gain.gain.exponentialRampToValueAtTime(0.0001,now+note[1]+1.15);
                            osc.connect(gain); gain.connect(master);
                            osc.start(now+note[1]); osc.stop(now+note[1]+1.2);
                        });
                        window.setTimeout(function(){ctx.close().catch(function(){});},1800);
                    };
                    if(ctx.state==='suspended'){
                        ctx.resume().then(play).catch(function(){ });
                    }else play();
                }catch(e){}
            }
            function startWelcomeSplash(){
                const splash=document.getElementById('welcome-splash');
                if(!splash) return;
                let alreadyShown=false;
                try{ alreadyShown=sessionStorage.getItem('unem_welcome_seen')==='1'; }catch(_){ alreadyShown=!!window.__unemWelcomeShown; }
                if(alreadyShown){
                    splash.classList.add('is-hidden');
                    splash.setAttribute('aria-hidden','true');
                    return;
                }
                try{ sessionStorage.setItem('unem_welcome_seen','1'); }catch(_){ window.__unemWelcomeShown=true; }
                if(typeof currentLang!=='undefined' && currentLang==='fr'){
                    const kicker=splash.querySelector('.welcome-kicker');
                    const title=splash.querySelector('.welcome-title');
                    const subtitle=splash.querySelector('.welcome-subtitle');
                    if(kicker) kicker.textContent='UNEM ISCAE';
                    if(title) title.textContent='Bienvenue sur la plateforme UNEM ISCAE';
                    if(subtitle) subtitle.textContent='Union Nationale des Étudiants de Mauritanie · Institut Supérieur de Comptabilité et d’Administration des Entreprises';
                }
                playWelcomeSound();
                ['pointerdown','touchstart','keydown','click'].forEach(function(eventName){
                    window.addEventListener(eventName,playWelcomeSound,{once:true,passive:true});
                });
                const reduced=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                // مدة قصيرة حتى لا تؤخر الشاشة الترحيبية دخول الطالب إلى المنصة.
                welcomeSplashTimer=window.setTimeout(window.dismissWelcomeSplash,reduced?500:900);
            }
            if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',startWelcomeSplash,{once:true});
            else startWelcomeSplash();
        })();
    