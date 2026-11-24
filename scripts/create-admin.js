import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
const scrypt=promisify(scryptCb);
const envFile=await import('node:fs/promises').then(m=>m.readFile(new URL('../.env',import.meta.url),'utf8').catch(()=>''));
for(const line of envFile.split(/\r?\n/)){const m=line.match(/^\s*([A-Z0-9_]+)=(.*)\s*$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');}
const email=(process.env.ADMIN_EMAIL||'').trim().toLowerCase();const password=process.env.ADMIN_PASSWORD||'';
if(!email||!email.includes('@')||password.length<14){console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 14 characters) in .env first.');process.exit(1);}
const dbPath=path.resolve(process.env.DATABASE_PATH||'./data/eduaxis.sqlite');await mkdir(path.dirname(dbPath),{recursive:true});
const db=new DatabaseSync(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('parent','admin')),full_name TEXT NOT NULL,phone TEXT,created_at TEXT NOT NULL);`);
const salt=randomBytes(16);const key=Buffer.from(await scrypt(password,salt,64));const hash=`${salt.toString('hex')}:${key.toString('hex')}`;
const existing=db.prepare('SELECT id FROM users WHERE email=?').get(email);
if(existing){db.prepare("UPDATE users SET password_hash=?,role='admin',full_name='EduAxis Administrator' WHERE email=?").run(hash,email);console.log(`Updated administrator: ${email}`);}else{db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(randomBytes(16).toString('hex'),email,hash,'admin','EduAxis Administrator','',new Date().toISOString());console.log(`Created administrator: ${email}`);}
db.close();
