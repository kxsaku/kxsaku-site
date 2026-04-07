    (function(){
      const a = document.getElementById("viewDesktop");
      if (!a) return;
      a.addEventListener("click", function(e){
        e.preventDefault();
        localStorage.setItem("sns_force_desktop", "1");
        location.replace("/sns-portal-invite/");
      });
    })();
