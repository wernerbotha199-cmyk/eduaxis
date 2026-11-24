import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const dir=await mkdtemp(path.join(os.tmpdir(),'eduaxis-test-'));
const port=18000+Math.floor(Math.random()*10000);
const env={...process.env,PORT:String(port),NODE_ENV:'development',DATABASE_PATH:path.join(dir,'test.sqlite'),ADMIN_EMAIL:'admin@test.example',ADMIN_PASSWORD:'CorrectHorseBatteryStaple!42'};
let server;
const base=`http://127.0.0.1:${port}`;
async function wait(){for(let i=0;i<60;i++){try{const r=await fetch(base+'/api/health');if(r.ok)return;}catch{}await delay(100);}throw new Error('server did not start');}
async function post(route,data,headers={}){return fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});}
test('EduAxis public forms, authentication and family-scoped portal',async t=>{
  try{
    const admin=spawn(process.execPath,['scripts/create-admin.js'],{cwd:path.resolve(import.meta.dirname,'..'),env,stdio:'ignore'});const code=await new Promise((resolve,reject)=>{admin.on('error',reject);admin.on('exit',resolve)});assert.equal(code,0,'admin bootstrap');
    server=spawn(process.execPath,['server.js'],{cwd:path.resolve(import.meta.dirname,'..'),env,stdio:'ignore'});await wait();
    let r=await fetch(base+'/api/health');assert.equal(r.status,200);
    r=await post('/api/enquiry',{parentName:'Test Parent',email:'parent@example.com',phone:'0600000000'});assert.equal(r.status,201);
    r=await post('/api/application',{parentName:'Test Parent',parentEmail:'parent@example.com',parentPhone:'0600000000',learnerName:'Test Learner',grade:'Grade 6',consent:true});assert.equal(r.status,201);
    r=await post('/api/booking',{parentName:'Test Parent',email:'parent@example.com',phone:'0600000000',date:'2027-01-10',time:'Morning'});assert.equal(r.status,201);
    r=await post('/api/register',{fullName:'Test Parent',email:'parent@example.com',phone:'0600000000',password:'A-long-test-password-123'});assert.equal(r.status,201);
    r=await post('/api/login',{email:'parent@example.com',password:'A-long-test-password-123'});assert.equal(r.status,200);const login=await r.json();const cookie=r.headers.get('set-cookie').split(';')[0];
    r=await fetch(base+'/api/portal',{headers:{Cookie:cookie}});assert.equal(r.status,200);const portal=await r.json();assert.equal(portal.learners.length,0);assert.equal(portal.role,'parent');
    r=await post('/api/login',{email:'admin@test.example',password:env.ADMIN_PASSWORD});assert.equal(r.status,200);const adminLogin=await r.json();const adminCookie=r.headers.get('set-cookie').split(';')[0];
    r=await post('/api/admin/learner',{parentEmail:'parent@example.com',name:'Test Learner',grade:'Grade 6',_csrf:adminLogin.csrf},{Cookie:adminCookie});assert.equal(r.status,201);
    r=await fetch(base+'/api/portal',{headers:{Cookie:cookie}});const linked=await r.json();assert.equal(linked.learners.length,1);assert.equal(linked.learners[0].name,'Test Learner');
    r=await post('/api/admin/record',{learnerId:linked.learners[0].id,type:'homework',title:'Maths practice',subject:'Mathematics',dueDate:'2027-01-12',details:'Complete questions 1–5.',_csrf:adminLogin.csrf},{Cookie:adminCookie});assert.equal(r.status,201);
    r=await fetch(base+'/api/portal',{headers:{Cookie:cookie}});const withWork=await r.json();assert.equal(withWork.learners[0].homework.length,1);
    r=await fetch(base+'/api/admin/summary',{headers:{Cookie:cookie}});assert.equal(r.status,403,'parent cannot access admin dashboard');
    r=await post('/api/register',{fullName:'Second Parent',email:'second@example.com',phone:'0611111111',password:'Another-long-password-123'});assert.equal(r.status,201);
    r=await post('/api/login',{email:'second@example.com',password:'Another-long-password-123'});const secondCookie=r.headers.get('set-cookie').split(';')[0];
    r=await fetch(base+'/api/portal',{headers:{Cookie:secondCookie}});const secondPortal=await r.json();assert.equal(secondPortal.learners.length,0,'second family cannot see first family learner');
    r=await post('/api/admin/record',{learnerId:linked.learners[0].id,type:'timetable',day:'Monday',time:'09:00',subject:'English',_csrf:adminLogin.csrf},{Cookie:adminCookie});assert.equal(r.status,201,'admin can save timetable');
    r=await post('/api/admin/resource',{title:'Fractions worksheet',grade:'Grade 6',subject:'Mathematics',description:'Practice fractions.',fileUrl:'/assets/worksheet.pdf',_csrf:adminLogin.csrf},{Cookie:adminCookie});assert.equal(r.status,201,'admin can publish a resource');
    r=await post('/api/admin/gallery',{title:'Learning room',imageUrl:'/assets/room.jpg',altText:'Approved learning room photograph',permissionConfirmed:true,_csrf:adminLogin.csrf},{Cookie:adminCookie});assert.equal(r.status,201,'gallery requires confirmed permission');
    r=await post('/api/admin/testimonial',{displayName:'Parent',quote:'A positive experience.',permissionConfirmed:true,_csrf:adminLogin.csrf},{Cookie:adminCookie});assert.equal(r.status,201,'testimonial requires confirmed permission');
    r=await fetch(base+'/api/public');const publicData=await r.json();assert.equal(publicData.resources.length,1);assert.equal(publicData.gallery.length,1);assert.equal(publicData.testimonials.length,1);
    r=await fetch(base+'/api/portal',{headers:{Cookie:cookie}});const withTimetable=await r.json();assert.equal(withTimetable.learners[0].timetable.length,1);
    r=await post('/api/logout',{_csrf:'wrong'},{Cookie:cookie,'X-CSRF-Token':'wrong'});assert.equal(r.status,403,'logout requires CSRF token');
  }finally{if(server){server.kill('SIGTERM');await delay(200);}await rm(dir,{recursive:true,force:true});}
});
