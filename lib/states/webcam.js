var see = require('../support/see')
  , $ = require('jquery');

exports.Activation = {
  enter: function(ctx){
    ctx.renderer.changeView('webcamActivation')
    $('#settingsGUIContainer').css('opacity',0);

    if( ctx.webcam ){
      console.log('already have webcam. skipping getUserMedia.')
      return see('/webcam/waiting');
    }

    if (!navigator.mediaDevices) return error();
    navigator.mediaDevices.getUserMedia({
      video: {width: {ideal: 320}, height: {ideal: 240}},
      audio: !ctx.dev
    }).then(success).catch(error);

    function success(stream){
      var videoInput = document.getElementById('localInput');
      videoInput.width = 320
      videoInput.height = 240
      videoInput.autoplay = true
      videoInput.muted = true
      videoInput.srcObject = stream
      videoInput.play().catch(function(){})
      ctx.renderer.triggerEvent('localVideoAvailable');
      ctx.webcam = true;

      ctx.network.remote.addStream(stream)
      see('/webcam/waiting')
    }

    function error(){
      ctx.webcam = false;
      see('/webcam/information');
    }
  },
  leave: function(ctx){
    $('#settingsGUIContainer').css('opacity',1);
  }
}


exports.Information = {
  enter: function(ctx){
    $('#activate-camera').on('click',function(){
      see('/webcam/activate')
    })
    $('.keyboard',ctx.el).on('click',function(){
      see('/game/start')
    })
  },
  leave: function(ctx){
    $('#activate-camera').off('click')
    $('.keyboard',ctx.el).off('click')
  }
}


exports.Waiting = {
  enter: function(ctx){
    function waitFor(){
      return ctx.network.pathname == '/webcam/waiting'
          || (ctx.network.pathname || '').indexOf('/game/') === 0;
    }
    if( waitFor() ){
      see('/game/instructions')
    } else {
      this.pathchange = function(pathname){
        if( waitFor() ){
          see('/game/instructions')
        }
      }
      ctx.network.on('change pathname',this.pathchange)
    }
  },
  leave: function(ctx,next){
    this.pathchange && ctx.network.off('change pathname', this.pathchange)

    // wait until ready before leaving
    if( ctx.network.ready ){
      next()
    } else {
      ctx.network.once('ready',function(){
        next()
      })
    }
  },
  cleanup: function(ctx){
    ctx.network.off('ready')
  }
}

