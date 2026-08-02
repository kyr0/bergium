#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <string.h>

static uint32_t rs=1; static uint64_t rcalls=0;
static int rr(void){ rs=rs*214013u+2531011u; rcalls++; return (rs>>16)&0x7fff; }
static int rmod(int n){ return rr()%n; }
static uint64_t fnv(const uint8_t *p,size_t n){ uint64_t h=14695981039346656037ULL; for(size_t i=0;i<n;i++){h^=p[i];h*=1099511628211ULL;} return h; }

#define W 640
#define H 480
static uint8_t fb[W*H+2048];
static int cx=320,cy=240,cut=4,hidecut=4;
static float fps=30.0f,floatframe=123.25f; static long intframe=77; static int chaser_offset=1234;
static float mc1[10],mc2[10],mc3[10],mf1[10],mf2[10],mf3[10],mf4[10],mr[4][10];
static int chx[20],chy[20],chptr=0; static uint8_t chr[20],chg[20],chb[20];

static void init(void){
 for(int i=0;i<W*H;i++) fb[i]=(uint8_t)((i*17+(i/W)*3)&255);
 for(int i=0;i<20;i++){chx[i]=1;chy[i]=1;}
 for(int z=0;z<10;z++){
  mc1[z]=(float)(0.08+0.09*rmod(1000)*0.001); mc2[z]=(float)(0.08+0.09*rmod(1000)*0.001); mc3[z]=(float)(0.08+0.09*rmod(1000)*0.001);
  mf1[z]=(float)(0.1+0.05*rmod(1000)*0.001); mf2[z]=(float)(0.1+0.05*rmod(1000)*0.001); mf3[z]=(float)(0.1+0.05*rmod(1000)*0.001); mf4[z]=(float)(0.1+0.05*rmod(1000)*0.001);
  mr[0][z]=(float)(2.0+2.8*rmod(1000)*0.001); mr[1][z]=(float)(2.0+2.8*rmod(1000)*0.001); mr[2][z]=(float)(2.0+2.8*rmod(1000)*0.001); mr[3][z]=(float)(2.0+2.8*rmod(1000)*0.001);
 }
}
static void shade(void){
 for(int x=0;x<1;x++){
  int cr=(int)(1+sinf(floatframe*mc1[x])); int cg=(int)(1+sinf(floatframe*mc2[x])); int cb=(int)(1+sinf(floatframe*mc3[x])); (void)cr;(void)cg;(void)cb;
  int a=cx+(int)(mr[0][x]*cosf(floatframe*mf1[x])+mr[2][x]*cosf(floatframe*mf2[x]));
  int b=cy+(int)(mr[1][x]*cosf(floatframe*mf3[x])+mr[3][x]*cosf(floatframe*mf4[x]));
  for(int k=0;k<4;k++){b+=rmod(5)-2;a+=rmod(5)-2;if(b>cut&&b<H-1-cut){int o=b*W+a;if(fb[o]<250)fb[o]+=2;if(fb[o+1]<250)fb[o+1]+=1;if(fb[o-1]<250)fb[o-1]+=1;if(fb[o+W]<250)fb[o+W]+=1;if(fb[o-W]<250)fb[o-W]+=1;}}
 }
}
static void chasers(void){
 float s=W/640.0f; float t=floatframe+chaser_offset; float ts=1.0f;if(fps>=10&&fps<120)ts=30.0f/fps;t*=ts;int passes=2;int k2=(int)(20*s);
 for(int k=0;k<k2;k++){t=t+0.08f*ts*20/(float)k2;for(int pass=0;pass<passes;pass++){int a,b;if(pass==0){a=cx+(int)(s*74*cosf(t*.1102f+10)+s*65*cosf(t*.1312f+20));b=cy+(int)(s*54*cosf(t*.1204f+40)+s*55*cosf(t*.1715f+30));}else{a=cx+(int)(s*64*cosf(t*.1213f+33)+s*55*cosf(t*.1408f+15));b=cy+(int)(s*52*cosf(t*.1304f+12)+s*51*cosf(t*.1103f+21));}if(b>cut&&b<H-1-cut){int o=b*W+a;fb[o]=(uint8_t)(255-(255-fb[o])*.6f);}}}
}
static void solid(void){
 float frame=floatframe+chaser_offset*.6f;int k,a,b,o;float x1,y1,x2,y2;float s=W/640.0f;frame=frame*.55f/(.08f*20);x1=cx+(s*16*cosf(frame*.1102f+10)+s*15*cosf(frame*.1312f+20));y1=cy+(s*15*cosf(frame*.1204f+40)+s*10*cosf(frame*.1715f+30));x2=cx+(s*14*cosf(frame*.1213f+33)+s*13*cosf(frame*.1408f+15));y2=cy+(s*13*cosf(frame*.1304f+12)+s*11*cosf(frame*.1103f+21));int k2=s*50;float inv=1.0f/k2;for(k=0;k<k2;k++){a=x1*(k*inv)+x2*(1-k*inv);b=y1*(k*inv)+y2*(1-k*inv);if(b>cut&&b<H-1-cut){o=b*W+a;if(fb[o]<223)fb[o]+=16;}}}
static void dot(void){
 int a,b;float s=W/640.0f;float t=floatframe;if(fps>=10&&fps<120)t*=30.0f/fps;a=cx+(int)(s*64*cosf(t*.0613+33)+s*55*cosf(t*.0708+15));b=cy+(int)(s*52*cosf(t*.0704+12)+s*51*cosf(t*.0503+21));if(b>cut&&b<H-1-cut){chptr=(chptr+1)%20;chx[chptr]=a;chy[chptr]=b;chr[chptr]=(uint8_t)(127+126*sinf(t*.0613+33));chg[chptr]=(uint8_t)(127+126*sinf(t*.0713+30));chb[chptr]=(uint8_t)(127+126*sinf(t*.0513+27));for(int k=0;k<20;k++){int o=chy[k]*W+chx[k];fb[o]=chr[k];chx[k]++;}}}
static void grid(void){int xi=W/30,yi=xi;uint8_t s=(uint8_t)fmax(0,65+45*sinf(intframe*.06033f*30.0f/fps)+35*cosf(intframe*.04710f*30.0f/fps+1)+25*cosf(intframe*.00523f*30.0f/fps-1));int dir=intframe%xi;if(-1==1)dir*=-1;for(int y=hidecut;y<H-hidecut;y+=yi){int row=y*W;for(int x=0;x<W;x+=xi){int o=row+x+dir;if(fb[o]<s)fb[o]=s;}}}
static void diminish(void){float d=.98f;int o=cy*W+cx;int os[5]={o,o-1,o+1,o+W,o-W};for(int i=0;i<5;i++)if(fb[os[i]]>1)fb[os[i]]=(uint8_t)(fb[os[i]]*d);}
int main(void){init();printf("init %016llx rng=%llu state=%u\n",(unsigned long long)fnv(fb,W*H),(unsigned long long)rcalls,rs);shade();printf("shade %016llx rng=%llu state=%u\n",(unsigned long long)fnv(fb,W*H),(unsigned long long)rcalls,rs);chasers();printf("chasers %016llx\n",(unsigned long long)fnv(fb,W*H));solid();printf("solid %016llx\n",(unsigned long long)fnv(fb,W*H));dot();printf("dot %016llx ptr=%d\n",(unsigned long long)fnv(fb,W*H),chptr);grid();printf("grid %016llx\n",(unsigned long long)fnv(fb,W*H));diminish();printf("diminish %016llx\n",(unsigned long long)fnv(fb,W*H));return 0;}
