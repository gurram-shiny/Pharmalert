import {reportGroups} from '../report-cases.mjs';
import assert from 'node:assert/strict';
import { Builder, By, Select, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const origin=process.env.PHARMALERT_WEB_URL ?? 'http://127.0.0.1:5173';
const options=new chrome.Options().addArguments('--headless=new','--no-sandbox','--disable-dev-shm-usage','--window-size=1440,1000');
const results=[];
let driver;
await mkdir('reports/evidence',{recursive:true});
const wait=(css)=>driver.wait(until.elementLocated(By.css(css)),10000);
const text=async(value)=>driver.wait(async()=>{try{return (await driver.findElement(By.css('body')).getText()).includes(value);}catch{return false;}},10000);
const button=async(value)=>{const el=await driver.wait(until.elementLocated(By.xpath('//button[normalize-space(.)='+JSON.stringify(value)+']')),10000);return driver.wait(until.elementIsEnabled(el),10000);};
async function exercise(id,description,expected,action){
  try{await action();results.push({id,description,expected,actual:expected,status:'PASS',timestamp:new Date().toISOString(),evidence:'tests/web/selenium.mjs'});}
  catch(error){results.push({id,description,expected,actual:error.message.split('\n')[0],status:'FAIL',timestamp:new Date().toISOString(),evidence:'tests/web/selenium.mjs'});throw error;}
}
try {
  driver=await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  const email=randomUUID()+'@example.test', password='test-session-password';
  await exercise('W01','Dashboard and protected route','Dashboard loads; anonymous access shows sign-in.',async()=>{await driver.get(origin);await text('Health overview');await driver.get(origin+'/medicines');await text('Sign in');await wait('input[name=email]');});
  await exercise('W02','Registration','A new account reaches the protected medicine page.',async()=>{await (await button('Create an account')).click();await (await wait('input[name=name]')).sendKeys('Selenium QA');await (await wait('input[name=email]')).sendKeys(email);await (await wait('input[name=password]')).sendKeys(password);await (await button('Create account')).click();await text('Add record');});
  await exercise('W03','Medicine record create and list','Saved medicine is shown in My medicines.',async()=>{await (await button('Add record')).click();await (await wait('input[name=name]')).sendKeys('Zocor');await (await button('Save record')).click();await text('Zocor');});
  await exercise('W04','Evidence-only checker and saved report','Sourced contraindication with label revision appears and is saved in history.',async()=>{await driver.get(origin+'/checker');await wait('.checker-row input');const inputs=await driver.findElements(By.css('.checker-row input'));assert.equal(inputs.length,2);await inputs[0].sendKeys('Zocor');await inputs[1].sendKeys('Gemfibrozil');await (await button('Check interactions')).click();await text('Contraindicated');await text('2026-11-27.audit1');await text('label v11');assert.equal(await (await wait('.pair a')).getAttribute('href'),'https://api.fda.gov/drug/label.json?search=id:%2211256523-425c-48e8-afe1-e3a4e28c892e%22');await driver.get(origin+'/history');await text('Zocor + Gemfibrozil');});
  await exercise('W05','Logout and login','Signing out protects the page; login restores saved data.',async()=>{await (await wait('[aria-label=Account]')).click();await (await button('Sign out')).click();await wait('input[name=email]');await (await wait('input[name=email]')).sendKeys(email);await (await wait('input[name=password]')).sendKeys(password);await (await button('Sign in')).click();await text('Zocor + Gemfibrozil');});
  const add = async (page,values) => {
    await driver.get(origin+'/'+page); await text('Add record'); await (await button('Add record')).click();
    for(const [name,value] of Object.entries(values)){
      const field=await wait('[name='+name+']');
      if(await field.getTagName()==='select')await field.findElement(By.css('option[value="'+value+'"]')).click();
      else if(value instanceof Date)await driver.executeScript('arguments[0].value=arguments[1]',field,value.toISOString().slice(0,16));
      else await field.sendKeys(value);
    }
    await (await button('Save record')).click();
    await driver.wait(async()=>!(await driver.findElements(By.css('.record-form'))).length,10000);
  };
  await exercise('W06','Supplements, alcohol and reminders','Synthetic entries persist and can be marked taken.',async()=>{
    await add('supplements',{name:'Test supplement',dosage:'Test dose'});await text('Test supplement');
    await add('alcohol_entries',{name:'Test beverage',amount:'Test amount',recorded_at:new Date()});await text('Test beverage');
    await add('reminders',{dosage:'QA dose',scheduled_at:new Date(Date.now()+3600000)});await text('QA dose');
    await (await button('taken')).click();await text('taken ·');
  });
  await exercise('W07','Prescriptions and health','A private upload appears, and a weight record is listed.',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'pharmalert-test-'));
    try{
      const file=join(dir,'test.pdf');
      await writeFile(file,'%PDF-1.7 synthetic automation fixture');
      await add('prescriptions',{doctor:'Test doctor',file});await text('Test doctor');
      await add('health_records',{kind:'weight',value:'70 kg',recorded_at:new Date()});await text('70 kg');await text('Measurement trends');
    }finally{await rm(dir,{recursive:true,force:true});}
  });
  await exercise('W08','Settings and export controls','Profile update persists and history offers export controls.',async()=>{
    await driver.get(origin+'/settings');const field=await wait('input[name=name]');await field.clear();await field.sendKeys('Web QA');
    await (await button('Save profile')).click();await text('Profile saved.');
    await driver.get(origin+'/history');await text('Print / PDF');await text('CSV');
  });
  await driver.get(origin);await text('Welcome, Web');
  const metric=await wait('.metric strong');
  await driver.wait(until.elementTextIs(metric,'1'),10000);
  await writeFile('reports/evidence/web-overview.png',Buffer.from(await driver.takeScreenshot(),'base64'));
  await driver.get(origin+'/checker');
  for(const group of reportGroups(true)){
    while((await driver.findElements(By.css('.checker-row'))).length<group.inputs.length)await (await button('Add substance')).click();
    for(const [i,item] of group.inputs.entries()){
      let field=(await driver.findElements(By.css('.checker-row')))[i];
      await new Select(await field.findElement(By.css('select'))).selectByVisibleText(item.kind);
      field=(await driver.findElements(By.css('.checker-row')))[i];
      if(item.kind==='alcohol'){
        assert.equal((await field.findElements(By.css('input'))).length,0);
      }else{
        const name=await field.findElement(By.css('input'));
        await driver.wait(until.elementIsVisible(name),10000);
        await driver.executeScript('arguments[0].scrollIntoView({block:"center"})',name);
        await name.clear();await name.sendKeys(item.name);
      }
    }
    await (await button('Check interactions')).click();
    await driver.wait(async()=>(await driver.findElements(By.css('.pair'))).length===group.pairs.length,15000);
    await driver.wait(until.elementIsEnabled(await button('Check interactions')),10000);
    const displayed=await driver.executeScript("return Array.from(document.querySelectorAll('.pair'),pair=>[pair.querySelector('h3').textContent,(pair.querySelector('.badge')||pair.querySelector('p')).textContent])");
    const observed=new Map(displayed);
    for(const pair of group.pairs){
      const heading=pair.heading.split(' + ').map(name=>group.inputs.find(item=>item.name===name)?.kind==='alcohol'?'Alcohol':name).join(' + ');
      await exercise('WP'+(results.length-7),'Checker pair: '+heading,pair.expected,async()=>assert.equal(observed.get(heading),pair.expected));
      results.at(-1).actual=observed.get(heading);
    }
  }
} finally {
  if(driver)await driver.quit();
  await writeFile('reports/evidence/selenium.json',JSON.stringify(results,null,2));
}

