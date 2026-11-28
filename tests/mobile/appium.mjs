import {execFileSync} from 'node:child_process';
import {groups} from '../report-cases.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { By,until,WebDriver } from 'selenium-webdriver';
import { Executor,HttpClient } from 'selenium-webdriver/http/index.js';
import { mkdir,writeFile } from 'node:fs/promises';
const apk=process.env.PHARMALERT_APK;
if(!apk)throw new Error('Set PHARMALERT_APK to the absolute path of an Android test build.');
const expectedPairCount=groups.reduce((total,group)=>total+group.pairs.length,0);
if(expectedPairCount<300)throw new Error(`Appium matrix requires at least 300 interaction-pair cases; configured ${expectedPairCount}.`);
const expectedCaseCount=expectedPairCount+(process.env.PHARMALERT_TEST_OFFLINE==='1'?6:5);
console.log(`Appium planned cases: ${expectedCaseCount} (${expectedPairCount} saved-report pairs plus ${expectedCaseCount-expectedPairCount} native flows).`);
const executor=new Executor(new HttpClient(process.env.APPIUM_URL ?? 'http://127.0.0.1:4723'));
const driver=WebDriver.createSession(executor,{platformName:'Android','appium:automationName':'UiAutomator2','appium:app':apk,...(process.env.ANDROID_SERIAL?{'appium:udid':process.env.ANDROID_SERIAL,'appium:systemPort':Number(process.env.APPIUM_SYSTEM_PORT??8201)}:{}),'appium:androidInstallTimeout':300000,'appium:adbExecTimeout':120000,'appium:uiautomator2ServerInstallTimeout':300000,'appium:uiautomator2ServerLaunchTimeout':300000,'appium:settingsAppLaunchTimeout':180000,'appium:newCommandTimeout':300});
const rows=[];
let pairIndex=0;
const email=randomUUID()+'@example.test';
const label=name=>driver.wait(until.elementLocated(By.xpath('//*[@content-desc='+JSON.stringify(name)+' or @text='+JSON.stringify(name)+']')),20000);
const input=name=>driver.wait(until.elementLocated(By.xpath('//android.widget.EditText[@content-desc='+JSON.stringify(name)+' or @text='+JSON.stringify(name)+']')),20000);
async function swipe(direction, percent=.75){
  const view=await driver.findElement(By.xpath('//android.widget.ScrollView[@scrollable="true"]'));
  return driver.executeScript('mobile: scrollGesture',{elementId:await view.getId(),direction,percent,speed:900});
}
async function scrollTo(name,query=By.xpath('//*[@content-desc='+JSON.stringify(name)+' or @text='+JSON.stringify(name)+']')){
  const [visible]=await driver.findElements(query);
  if(visible)return visible;
  const match=query.value.includes('android.widget.EditText')?'description':'text';
  const selector='new UiScrollable(new UiSelector().scrollable(true)).setMaxSearchSwipes(120).scrollIntoView(new UiSelector().'+match+'('+JSON.stringify(name)+'))';
  await driver.findElements({using:'-android uiautomator',value:selector});
  return driver.wait(until.elementLocated(query),10000);
}
async function scrollToTop(){
  for(let page=0;page<100;page++)if(!await swipe('up',1))return;
  throw Error('Did not reach top of Android scroll view.');
}
async function run(id,description,expected,check){
  try{await check();rows.push({id,description,expected,actual:expected,status:'PASS',timestamp:new Date().toISOString(),evidence:'tests/mobile/appium.mjs'});}
  catch(error){
    if(!id.startsWith('MP')){
      await mkdir('reports/evidence',{recursive:true});
      const xml=await driver.getPageSource().catch(()=>null);
      if(xml)await writeFile('reports/evidence/appium-'+id+'.xml',xml);
    }
    rows.push({id,description,expected,actual:error.message.split('\n')[0],status:'FAIL',timestamp:new Date().toISOString(),evidence:'tests/mobile/appium.mjs'});console.error(`${id} failed: ${error.message.split('\n')[0]}`);}
}
try{
  await driver.getSession();
  await run('M01','Native authentication screen','Sign-in and registration are visible.',async()=>{assert.ok(await label('Sign in'));assert.ok(await label('Create an account'));});
  await run('M02','Native registration and tabs','An account reaches the native overview.',async()=>{await (await label('Create an account')).click();await (await label('Name')).sendKeys('Appium QA');await (await label('Email')).sendKeys(email);await (await label('Password')).sendKeys('test-session-password');await driver.executeScript('mobile: hideKeyboard').catch(()=>{});await (await label('Create account')).click();assert.ok(await label('Welcome, Appium'));});
  await run('M03','Native medicines and checker','A saved medicine appears and a sourced finding is returned.',async()=>{
    await (await label('Medicines')).click();await (await label('Add record')).click();
    await (await input('Medicine name')).sendKeys('Zocor');await driver.executeScript('mobile: hideKeyboard').catch(()=>{});
    await (await scrollTo('Save record')).click();assert.ok(await label('Medicine name · Zocor'));
    await (await label('Check')).click();await (await input('Substance 1')).sendKeys('Zocor');await driver.executeScript('mobile: hideKeyboard').catch(()=>{});
    await (await scrollTo('Substance 2',By.xpath('//android.widget.EditText[@content-desc="Substance 2"]'))).sendKeys('Gemfibrozil');
    await driver.executeScript('mobile: hideKeyboard').catch(()=>{});await (await scrollTo('Check interactions')).click();
    await scrollTo('Interaction report');
    assert.ok(await scrollTo('Contraindicated'));
  });
  await run('MC01','Medicine and supplement catalog search','The selected historical product is identified in each US catalog.',async()=>{
    await (await label('Check')).click();
    await scrollToTop();
    await (await driver.findElements(By.xpath('//*[@content-desc="Supplement"]')))[0].click();
    await (await driver.findElements(By.xpath('//*[@content-desc="Medicine"]')))[0].click();
    const first=await input('Substance 1');
    await first.clear();
    await first.sendKeys('8-MO');
    await driver.executeScript('mobile: hideKeyboard').catch(()=>{});
    await (await scrollTo('8-MOP \u00b7 Historical product only',By.xpath('//*[@content-desc="8-MOP \u00b7 Historical product only"]'))).click();
    assert.ok(await scrollTo('US catalog · Historical product only'));
    await scrollToTop();
    await (await driver.findElements(By.xpath('//*[@content-desc="Supplement"]')))[0].click();
    const supplement=await input('Substance 1');
    assert.ok(await driver.findElement(By.xpath('//android.widget.EditText[@content-desc="Substance 1" and @hint="Search supplement labels"]')));
    await supplement.sendKeys('#14 LB-CLN');
    await driver.executeScript('mobile: hideKeyboard').catch(()=>{});
    assert.ok(await scrollTo('US catalog · Historical product only'));
  });
  await run('MC02','Alcohol, submission and category reset','Alcohol needs no name and switching back clears the previous entry.',async()=>{
    await scrollToTop();
    await (await driver.findElements(By.xpath('//*[@content-desc="Alcohol"]')))[0].click();
    assert.equal((await driver.findElements(By.xpath('//android.widget.EditText[@content-desc="Substance 1"]'))).length,0);
    await (await scrollTo('Check interactions')).click();
    assert.ok(await scrollTo('Alcohol + Gemfibrozil'));
    await scrollToTop();
    await (await driver.findElements(By.xpath('//*[@content-desc="Medicine"]')))[0].click();
    assert.ok(await driver.findElement(By.xpath('//android.widget.EditText[@content-desc="Substance 1" and @hint="Search brand or ingredient"]')));
  });
  // Generate genuine saved reports through the same local API used by the app.
  const api=process.env.PHARMALERT_API_URL??'http://127.0.0.1:8787/api';
  const post=async(path,body,token)=>{
    const response=await fetch(api+'/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
    assert.equal(response.status,200,await response.clone().text());
    return response.json();
  };
  const {token}=await post('auth/login',{email,password:'test-session-password'});
  for(const group of groups)await post('check',{substances:group.inputs},token);
  await (await label('Records')).click();
  await (await label('Check history')).click();
  const scroll=async direction=>{
    const view=await driver.findElement(By.xpath('//android.widget.ScrollView[@scrollable="true"]'));
    return driver.executeScript('mobile: scrollGesture',{elementId:await view.getId(),direction,percent:.55,speed:900});
  };
  for(const group of groups){
    for(let i=0;i<80 && !(await driver.findElements(By.xpath('//android.widget.EditText[@content-desc="Search history"]'))).length;i++)await scroll('up');
    const search=await input('Search history');
    await search.clear();await search.sendKeys(group.key);
    await driver.executeScript('mobile: hideKeyboard').catch(()=>{});
    await (await scrollTo('View report')).click();
    await scrollTo('Interaction report');
    const headings=new Set(group.pairs.map(pair=>pair.heading));
    const observed=new Map();
    const tabLabels=new Set(['Overview','Check','Medicines','Records']);
    for(let page=0;page<100;page++){
      const xml=await driver.getPageSource();
      // A heading at the viewport edge has no visible result yet. Exclude
      // the tab bar outside the report before pairing adjacent text nodes.
      const reportXml=xml.split('</android.widget.ScrollView>')[0];
      const lines=[...reportXml.matchAll(/<android\.widget\.TextView\b[^>]*?\btext="([^"]+)"/g)].map(match=>match[1]);
      for(let i=0;i+1<lines.length;i++){
        if(headings.has(lines[i])&&!headings.has(lines[i+1])&&!tabLabels.has(lines[i+1]))observed.set(lines[i],lines[i+1]);
      }
      if(observed.size===headings.size)break;
      const canScroll=await scroll('down');
      if(!canScroll && page>0){
        if(page===99)break;
        // One final snapshot includes the end of the report.
        page=98;
      }
    }
    for(const pair of group.pairs){
      await run('MP'+(++pairIndex),'Saved report pair: '+pair.heading,pair.expected,async()=>assert.equal(observed.get(pair.heading),pair.expected,pair.heading));
      rows.at(-1).actual=observed.get(pair.heading);
    }
    console.log(group.key,observed.size,'pairs verified');
  }
  if(process.env.PHARMALERT_TEST_OFFLINE==='1'){
    if(!/^emulator-\d+$/.test(process.env.ANDROID_SERIAL??''))throw Error('Offline test requires an explicitly selected emulator.');
    const adb=process.env.PHARMALERT_ADB??'adb';
    const shell=(...args)=>execFileSync(adb,['-s',process.env.ANDROID_SERIAL,'shell',...args],{encoding:'utf8',timeout:30000});
    await run('MC03','Offline sign-out survives reopening','Sign-out clears the native session with no default network and survives relaunch.',async()=>{
      for(let i=0;i<80&&!(await driver.findElements(By.xpath('//*[@content-desc="Account"]'))).length;i++)await scroll('up');
      await (await label('Account')).click();
      await label('Sign out');
      const previous=shell('settings','get','global','airplane_mode_on').trim()==='1';
      try{
        shell('cmd','connectivity','airplane-mode','enable');
        await driver.wait(async()=>/Active default network:\s*(?:none|null)/i.test(shell('dumpsys','connectivity')),20000);
        await (await label('Sign out')).click();
        assert.ok(await label('Create an account'));
        await driver.executeScript('mobile: terminateApp',{appId:'com.pharmalert.app'});
        await driver.executeScript('mobile: activateApp',{appId:'com.pharmalert.app'});
        assert.ok(await label('Create an account'));
      }finally{shell('cmd','connectivity','airplane-mode',previous?'enable':'disable');}
    });
  }
  if(rows.length!==expectedCaseCount)throw new Error(`Appium executed ${rows.length} of ${expectedCaseCount} planned cases.`);
  const failedCount=rows.filter(row=>row.status==='FAIL').length;
  if(failedCount)throw new Error(`Appium completed ${rows.length} cases with ${failedCount} failure(s).`);
} catch(error) {
  await mkdir('reports/evidence',{recursive:true});
  const source=await driver.getPageSource().catch(()=>null);
  if(source)await writeFile('reports/evidence/appium-page.xml',source);
  throw error;
} finally {
  await driver.quit().catch(()=>{});
  await mkdir('reports/evidence',{recursive:true});await writeFile('reports/evidence/appium.json',JSON.stringify(rows,null,2));
}

