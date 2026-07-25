/** Values copied as behavior, not shared with the Geiss analyzer. */
export const BUTTERCHURN_PINNED = Object.freeze({
  revision:"fbac2f6bab62fd9c6a50ebbeb29359c5eb05903e",
  defaultWidth:1200,defaultHeight:900,meshWidth:48,meshHeight:36,
  gl:{alpha:false,antialias:false,depth:false,stencil:false,premultipliedAlpha:false},
  audio:{deliveredSamples:512,fftSize:1024,analyserSmoothing:0,bandsHz:[[20,320],[320,2800],[2800,11025]] as const,averageAttack:.2,averageRelease:.5,longInitial:.9,longSteady:.992,longInitialFrames:50,rateBaseFps:30},
  blurRatios:[[.5,.25],[.125,.125],[.0625,.0625]] as const,
  passOrder:["audio","equations","feedback-swap+mipmap","warp","blur","motion-vectors","custom-shapes","custom-waves","previous-blend-sprites","basic-wave","darken-center","outer-border","inner-border","title","composite-output"] as const,
});

export const BUTTERCHURN_BASE_DEFAULTS = Object.freeze({
  decay:.98,gammaadj:2,echo_zoom:2,echo_alpha:0,echo_orient:0,red_blue:0,
  brighten:0,darken:0,wrap:1,darken_center:0,solarize:0,invert:0,
  bmotionvectorson:1,wave_mode:0,additivewave:0,wave_dots:0,wave_thick:0,
  wave_a:.8,wave_scale:1,wave_smoothing:.75,wave_mystery:0,
  modwavealphabyvolume:0,modwavealphastart:.75,modwavealphaend:.95,
  wave_r:1,wave_g:1,wave_b:1,wave_x:.5,wave_y:.5,wave_brighten:1,
  mv_x:12,mv_y:9,mv_dx:0,mv_dy:0,mv_l:.9,mv_r:1,mv_g:1,mv_b:1,mv_a:1,
  warpanimspeed:1,warpscale:1,zoomexp:1,zoom:1,rot:0,cx:.5,cy:.5,dx:0,dy:0,
  warp:1,sx:1,sy:1,ob_size:.01,ob_r:0,ob_g:0,ob_b:0,ob_a:0,
  ib_size:.01,ib_r:.25,ib_g:.25,ib_b:.25,ib_a:0,
});

export function butterchurnBandBins(sampleRate:number):readonly [number[],number[]] {
  const bucketHz=sampleRate/1024,bin=(hz:number)=>Math.max(0,Math.min(511,Math.round(hz/bucketHz)-1));
  const bassLow=bin(20),bassHigh=bin(320),midHigh=bin(2800),trebHigh=bin(11025);
  return [[bassLow,bassHigh,midHigh],[bassHigh,midHigh,trebHigh]];
}

