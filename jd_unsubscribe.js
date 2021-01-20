/*
脚本：取关京东店铺和商品
更新时间：2020-11-22
因种豆得豆和宠汪汪以及NobyDa大佬的京东签到脚本会关注店铺和商品，故此脚本用来取消已关注的店铺和商品
默认每运行一次脚本取消关注10个商品，10个店铺。可结合boxjs自定义取消多少个（目前测试通过最大数量是一次性取消300个商品无异常，大于300请自行测试，建议尽量不要一次性全部取消以免出现问题）。
建议此脚本运行时间在 种豆得豆和宠汪汪脚本运行之后 再执行
现有功能: 1、取关商品。2、取关店铺。3、匹配到boxjs输入的过滤关键词后，不再进行此商品/店铺后面(包含输入的关键词商品/店铺)的取关。4、支持京东双账号
脚本兼容: Quantumult X, Surge, Loon, JSBox, Node.js
// Quantumult X
[task_local]
#取关京东店铺商品
55 23 * * * https://raw.githubusercontent.com/LXK9301/jd_scripts/master/jd_unsubscribe.js, tag=取关京东店铺商品, enabled=true
// Loon
[Script]
cron "55 23 * * *" script-path=https://raw.githubusercontent.com/LXK9301/jd_scripts/master/jd_unsubscribe.js,tag=取关京东店铺商品
// Surge
取关京东店铺商品 = type=cron,cronexp="55 23 * * *",wake-system=1,timeout=20,script-path=https://raw.githubusercontent.com/LXK9301/jd_scripts/master/jd_unsubscribe.js
 */
const $ = new Env('取关京东店铺和商品');
//Node.js用户请在jdCookie.js处填写京东ck;
const jdCookieNode = $.isNode() ? require('./jdCookie.js') : '';
const notify = $.isNode() ? require('./sendNotify') : '';

//IOS等用户直接用NobyDa的jd cookie
let cookiesArr = [], cookie = '';
if ($.isNode()) {
  Object.keys(jdCookieNode).forEach((item) => {
    cookiesArr.push(jdCookieNode[item])
  })
  if (process.env.JD_DEBUG && process.env.JD_DEBUG === 'false') console.log = () => {};
} else {
  let cookiesData = $.getdata('CookiesJD') || "[]";
  cookiesData = jsonParse(cookiesData);
  cookiesArr = cookiesData.map(item => item.cookie);
  cookiesArr.reverse();
  cookiesArr.push(...[$.getdata('CookieJD2'), $.getdata('CookieJD')]);
  cookiesArr.reverse();
  cookiesArr = cookiesArr.filter(item => item !== "" && item !== null && item !== undefined);
}
const jdNotify = $.getdata('jdUnsubscribeNotify');//是否关闭通知，false打开通知推送，true关闭通知推送
let goodPageSize = $.getdata('jdUnsubscribePageSize') || 20;// 运行一次取消多少个已关注的商品。数字0表示不取关任何商品
let shopPageSize = $.getdata('jdUnsubscribeShopPageSize') || 20;// 运行一次取消多少个已关注的店铺。数字0表示不取关任何店铺
let stopGoods = $.getdata('jdUnsubscribeStopGoods') || '';//遇到此商品不再进行取关，此处内容需去商品详情页（自营处）长按拷贝商品信息
let stopShop = $.getdata('jdUnsubscribeStopShop') || '';//遇到此店铺不再进行取关，此处内容请尽量从头开始输入店铺名称
const JD_API_HOST = 'https://wq.jd.com/fav';
!(async () => {
  if (!cookiesArr[0]) {
    $.msg('【京东账号一】取关京东店铺商品失败', '【提示】请先获取京东账号一cookie\n直接使用NobyDa的京东签到获取', 'https://bean.m.jd.com/bean/signIndex.action', {"open-url": "https://bean.m.jd.com/bean/signIndex.action"});
  }
  for (let i = 0; i < cookiesArr.length; i++) {
    if (cookiesArr[i]) {
      cookie = cookiesArr[i];
      $.UserName = decodeURIComponent(cookie.match(/pt_pin=(.+?);/) && cookie.match(/pt_pin=(.+?);/)[1])
      $.index = i + 1;
      $.isLogin = true;
      $.nickName = '';
      await TotalBean();
      console.log(`\n开始【京东账号${$.index}】${$.nickName || $.UserName}\n`);
      if (!$.isLogin) {
        $.msg($.name, `【提示】cookie已失效`, `京东账号${$.index} ${$.nickName || $.UserName}\n请重新登录获取\nhttps://bean.m.jd.com/bean/signIndex.action`, {"open-url": "https://bean.m.jd.com/bean/signIndex.action"});

        if ($.isNode()) {
          await notify.sendNotify(`${$.name}cookie已失效 - ${$.UserName}`, `京东账号${$.index} ${$.UserName}\n请重新登录获取cookie`);
        }
        continue
      }
      await requireConfig();
      await jdUnsubscribe();
      await showMsg();
    }
  }
})()
    .catch((e) => {
      $.log('', `❌ ${$.name}, 失败! 原因: ${e}!`, '')
    })
    .finally(() => {
      $.done();
    })
async function jdUnsubscribe(doubleKey) {
  await Promise.all([
    unsubscribeGoods(doubleKey),
    unsubscribeShops()
  ])
  await Promise.all([
    getFollowShops(),
    getFollowGoods()
  ])
}
function showMsg() {
  if (!jdNotify || jdNotify === 'false') {
    $.msg($.name, ``, `【京东账号${$.index}】${$.nickName}\n【已取消关注店铺】${$.unsubscribeShopsCount}个\n【已取消关注商品】${$.unsubscribeGoodsCount}个\n【还剩关注店铺】${$.shopsTotalNum}个\n【还剩关注商品】${$.goodsTotalNum}个\n`);
  } else {
    $.log(`\n【京东账号${$.index}】${$.nickName}\n【已取消关注店铺】${$.unsubscribeShopsCount}个\n【已取消关注商品】${$.unsubscribeGoodsCount}个\n【还剩关注店铺】${$.shopsTotalNum}个\n【还剩关注商品】${$.goodsTotalNum}个\n`);
  }
}
function unsubscribeGoods() {
  return new Promise(async (resolve) => {
    let followGoods = await getFollowGoods();
    if (followGoods.iRet === '0') {
      let count = 0;
      $.unsubscribeGoodsCount = count;
      if ((goodPageSize * 1) !== 0) {
        if (followGoods.totalNum > 0) {
          for (let item of followGoods.data) {

            console.log(`是否匹配：：${item.commTitle.indexOf(stopGoods.replace(/\ufffc|\s*/g, ''))}`)

            if (stopGoods && item.commTitle.indexOf(stopGoods.replace(/\ufffc|\s*/g, '')) > -1) {
              console.log(`匹配到了您设定的商品--${stopGoods}，不在进行取消关注商品`)
              break;
            }
            let res = await unsubscribeGoodsFun(item.commId);
            // console.log('取消关注商品结果', res);
            if (res.iRet === 0 && res.errMsg === 'success') {
              console.log(`取消关注商品---${item.commTitle.substring(0, 20).concat('...')}---成功\n`)
              count ++;
            } else {
              console.log(`取消关注商品---${item.commTitle.substring(0, 20).concat('...')}---失败\n`)
            }
          }
          $.unsubscribeGoodsCount = count;
          resolve(count)
        } else {
          resolve(count)
        }
      } else {
        console.log(`\n您设置的是不取关商品\n`);
        resolve(count);
      }
    }
  })
}
function getFollowGoods() {
  return new Promise((resolve) => {
    const option = {
      url: `${JD_API_HOST}/comm/FavCommQueryFilter?cp=1&pageSize=${goodPageSize}&category=0&promote=0&cutPrice=0&coupon=0&stock=0&areaNo=1_72_4139_0&sceneval=2&g_login_type=1&callback=jsonpCBKB&g_ty=ls`,
      headers: {
        "Host": "wq.jd.com",
        "Accept": "*/*",
        "Connection": "keep-alive",
        "Cookie": cookie,
        "User-Agent": $.isNode() ? (process.env.JD_USER_AGENT ? process.env.JD_USER_AGENT : (require('./USER_AGENTS').USER_AGENT)) : ($.getdata('JDUA') ? $.getdata('JDUA') : "jdapp;iPhone;9.2.2;14.2;%E4%BA%AC%E4%B8%9C/9.2.2 CFNetwork/1206 Darwin/20.1.0"),
        "Accept-Language": "zh-cn",
        "Referer": "https://wqs.jd.com/my/fav/goods_fav.shtml?ptag=37146.4.1&sceneval=2&jxsid=15963530166144677970",
        "Accept-Encoding": "gzip, deflate, br"
      },
    }
    $.get(option, (err, resp, data) => {
      try {
        data = JSON.parse(data.slice(14, -13));
        $.goodsTotalNum = data.totalNum;
        // console.log('data', data.data.length)
      } catch (e) {
        $.logErr(e, resp);
      } finally {
        resolve(data);
      }
    });
  })
}
function unsubscribeGoodsFun(commId) {
  return new Promise(resolve => {
    const option = {
      url: `${JD_API_HOST}/comm/FavCommDel?commId=${commId}&_=${Date.now()}&sceneval=2&g_login_type=1&callback=jsonpCBKP&g_ty=ls`,
      headers: {
        "Host": "wq.jd.com",
        "Accept": "*/*",
        "Connection": "keep-alive",
        'User-Agent': $.isNode() ? (process.env.JD_USER_AGENT ? process.env.JD_USER_AGENT : (require('./USER_AGENTS').USER_AGENT)) : ($.getdata('JDUA') ? $.getdata('JDUA') : "jdapp;iPhone;9.2.2;14.2;%E4%BA%AC%E4%B8%9C/9.2.2 CFNetwork/1206 Darwin/20.1.0"),
        'Referer': 'https://wqs.jd.com/my/fav/goods_fav.shtml?ptag=37146.4.1&sceneval=2&jxsid=15963530166144677970',
        'Cookie': cookie,
        "Accept-Language": "zh-cn",
        "Accept-Encoding": "gzip, deflate, br"
      },
    }
    $.get(option, (err, resp, data) => {
      try {
        data = JSON.parse(data.slice(14, -13).replace(',}', '}'));
        // console.log('data', data);
        // console.log('data', data.errMsg);
      } catch (e) {
        $.logErr(e, resp);
      } finally {
        resolve(data);
      }
    });
  })
}

function unsubscribeShops() {
  return new Promise(async (resolve) => {
    let followShops = await getFollowShops();
    if (followShops.iRet === '0') {
      let count = 0;
      $.unsubscribeShopsCount = count;
      if ((shopPageSize * 1) !== 0) {
        if (followShops.totalNum > 0) {
          for (let item of followShops.data) {
            if (stopShop && (item.shopName && item.shopName.indexOf(stopShop.replace(/\s*/g, '')) > -1)) {
              console.log(`匹配到了您设定的店铺--${item.shopName}，不在进行取消关注店铺`)
              break;
            }
            let res = await unsubscribeShopsFun(item.shopId);
            // console.log('取消关注店铺结果', res);
            if (res.iRet === '0') {
              console.log(`取消已关注店铺---${item.shopName}----成功\n`)
              count ++;
            } else {
              console.log(`取消已关注店铺---${item.shopName}----失败\n`)
            }
          }
          $.unsubscribeShopsCount = count;
          resolve(count)
        } else {
          resolve(count)
        }
      } else {
        console.log(`\n您设置的是不取关店铺\n`);
        resolve(count)
      }
    }
  })
}
function getFollowShops() {
  return new Promise((resolve) => {
    const option = {
      url: `${JD_API_HOST}/shop/QueryShopFavList?cp=1&pageSize=${shopPageSize}&sceneval=2&g_login_type=1&callback=jsonpCBKA&g_ty=ls`,
      headers: {
        "Host": "wq.jd.com",
        "Accept": "*/*",
        "Connection": "keep-alive",
        "Cookie": cookie,
        "User-Agent": $.isNode() ? (process.env.JD_USER_AGENT ? process.env.JD_USER_AGENT : (require('./USER_AGENTS').USER_AGENT)) : ($.getdata('JDUA') ? $.getdata('JDUA') : "jdapp;iPhone;9.2.2;14.2;%E4%BA%AC%E4%B8%9C/9.2.2 CFNetwork/1206 Darwin/20.1.0"),
        "Accept-Language": "zh-cn",
        "Referer": "https://wqs.jd.com/my/fav/shop_fav.shtml?sceneval=2&jxsid=15963530166144677970&ptag=7155.1.9",
        "Accept-Encoding": "gzip, deflate, br"
      },
    }
    $.get(option, (err, resp, data) => {
      try {
        data = JSON.parse(data.slice(14, -13));
        $.shopsTotalNum = data.totalNum;
      } catch (e) {
        $.logErr(e, resp);
      } finally {
        resolve(data);
      }
    });
  })
}
function unsubscribeShopsFun(shopId) {
  return new Promise(resolve => {
    const option = {
      url: `${JD_API_HOST}/shop/DelShopFav?shopId=${shopId}&_=${Date.now()}&sceneval=2&g_login_type=1&callback=jsonpCBKG&g_ty=ls`,
      headers: {
        "Host": "wq.jd.com",
        "Accept": "*/*",
        "Connection": "keep-alive",
        'User-Agent': $.isNode() ? (process.env.JD_USER_AGENT ? process.env.JD_USER_AGENT : (require('./USER_AGENTS').USER_AGENT)) : ($.getdata('JDUA') ? $.getdata('JDUA') : "jdapp;iPhone;9.2.2;14.2;%E4%BA%AC%E4%B8%9C/9.2.2 CFNetwork/1206 Darwin/20.1.0"),
        'Referer': 'https://wqs.jd.com/my/fav/shop_fav.shtml?sceneval=2&jxsid=15960121319555534107&ptag=7155.1.9',
        'Cookie': cookie,
        "Accept-Language": "zh-cn",
        "Accept-Encoding": "gzip, deflate, br"
      },
    }
    $.get(option, (err, resp, data) => {
      try {
        data = JSON.parse(data.slice(14, -13));
      } catch (e) {
        $.logErr(e, resp);
      } finally {
        resolve(data);
      }
    });
  })
}
function TotalBean() {
  return new Promise(async resolve => {
    const options = {
      "url": `https://wq.jd.com/user/info/QueryJDUserInfo?sceneval=2`,
      "headers": {
        "Accept": "application/json,text/plain, */*",
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "zh-cn",
        "Connection": "keep-alive",
        "Cookie": cookie,
        "Referer": "https://wqs.jd.com/my/jingdou/my.shtml?sceneval=2",
        "User-Agent": $.isNode() ? (process.env.JD_USER_AGENT ? process.env.JD_USER_AGENT : (require('./USER_AGENTS').USER_AGENT)) : ($.getdata('JDUA') ? $.getdata('JDUA') : "jdapp;iPhone;9.2.2;14.2;%E4%BA%AC%E4%B8%9C/9.2.2 CFNetwork/1206 Darwin/20.1.0")
      }
    }
    $.post(options, (err, resp, data) => {
      try {
        if (err) {
          console.log(`${JSON.stringify(err)}`)
          console.log(`${$.name} API请求失败，请检查网路重试`)
        } else {
          if (data) {
            data = JSON.parse(data);
            if (data['retcode'] === 13) {
              $.isLogin = false; //cookie过期
              return
            }
            $.nickName = data['base'].nickname;
          } else {
            console.log(`京东服务器返回空数据`)
          }
        }
      } catch (e) {
        $.logErr(e, resp)
      } finally {
        resolve();
      }
    })
  })
}
function requireConfig() {
  return new Promise(resolve => {
    if ($.isNode() && process.env.UN_SUBSCRIBES) {
      if (process.env.UN_SUBSCRIBES.indexOf('&') > -1) {
        $.UN_SUBSCRIBES = process.env.UN_SUBSCRIBES.split('&');
      } else if (process.env.UN_SUBSCRIBES.indexOf('\n') > -1) {
        $.UN_SUBSCRIBES = process.env.UN_SUBSCRIBES.split('\n');
      } else if (process.env.UN_SUBSCRIBES.indexOf('\\n') > -1) {
        $.UN_SUBSCRIBES = process.env.UN_SUBSCRIBES.split('\\n');
      } else {
        $.UN_SUBSCRIBES = process.env.UN_SUBSCRIBES.split();
      }
      console.log(`您secret设置的取关参数:\n${JSON.stringify($.UN_SUBSCRIBES)}`)
      goodPageSize = $.UN_SUBSCRIBES[0] || goodPageSize;
      shopPageSize = $.UN_SUBSCRIBES[1] || shopPageSize;
      stopGoods = $.UN_SUBSCRIBES[2] || stopGoods;
      stopShop = $.UN_SUBSCRIBES[3] || stopShop;
    }
    resolve()
  })
}
function jsonParse(str) {
  if (typeof str == "string") {
    try {
      return JSON.parse(str);
    } catch (e) {
      console.log(e);
      $.msg($.name, '', '请勿随意在BoxJs输入框修改内容\n建议通过脚本去获取cookie')
      return [];
    }
  }
}
// prettier-ignore
function Env(t,e){class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;return"POST"===e&&(s=this.post),new Promise((e,i)=>{s.call(this,t,(t,s,r)=>{t?i(t):e(s)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`🔔${this.name}, 开始!`)}isNode(){return"undefined"!=typeof module&&!!module.exports}isQuanX(){return"undefined"!=typeof $task}isSurge(){return"undefined"!=typeof $httpClient&&"undefined"==typeof $loon}isLoon(){return"undefined"!=typeof $loon}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null){try{return JSON.stringify(t)}catch{return e}}getjson(t,e){let s=e;const i=this.getdata(t);if(i)try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise(e=>{this.get({url:t},(t,s,i)=>e(i))})}runScript(t,e){return new Promise(s=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let r=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");r=r?1*r:20,r=e&&e.timeout?e.timeout:r;const[o,h]=i.split("@"),a={url:`http://${h}/v1/scripting/evaluate`,body:{script_text:t,mock_type:"cron",timeout:r},headers:{"X-Key":o,Accept:"*/*"}};this.post(a,(t,e,i)=>s(i))}).catch(t=>this.logErr(t))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e);if(!s&&!i)return{};{const i=s?t:e;try{return JSON.parse(this.fs.readFileSync(i))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e),r=JSON.stringify(this.data);s?this.fs.writeFileSync(t,r):i?this.fs.writeFileSync(e,r):this.fs.writeFileSync(t,r)}}lodash_get(t,e,s){const i=e.replace(/\[(\d+)\]/g,".$1").split(".");let r=t;for(const t of i)if(r=Object(r)[t],void 0===r)return s;return r}lodash_set(t,e,s){return Object(t)!==t?t:(Array.isArray(e)||(e=e.toString().match(/[^.[\]]+/g)||[]),e.slice(0,-1).reduce((t,s,i)=>Object(t[s])===t[s]?t[s]:t[s]=Math.abs(e[i+1])>>0==+e[i+1]?[]:{},t)[e[e.length-1]]=s,t)}getdata(t){let e=this.getval(t);if(/^@/.test(t)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(t),r=s?this.getval(s):"";if(r)try{const t=JSON.parse(r);e=t?this.lodash_get(t,i,""):e}catch(t){e=""}}return e}setdata(t,e){let s=!1;if(/^@/.test(e)){const[,i,r]=/^@(.*?)\.(.*?)$/.exec(e),o=this.getval(i),h=i?"null"===o?null:o||"{}":"{}";try{const e=JSON.parse(h);this.lodash_set(e,r,t),s=this.setval(JSON.stringify(e),i)}catch(e){const o={};this.lodash_set(o,r,t),s=this.setval(JSON.stringify(o),i)}}else s=this.setval(t,e);return s}getval(t){return this.isSurge()||this.isLoon()?$persistentStore.read(t):this.isQuanX()?$prefs.valueForKey(t):this.isNode()?(this.data=this.loaddata(),this.data[t]):this.data&&this.data[t]||null}setval(t,e){return this.isSurge()||this.isLoon()?$persistentStore.write(t,e):this.isQuanX()?$prefs.setValueForKey(t,e):this.isNode()?(this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0):this.data&&this.data[e]||null}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar))}get(t,e=(()=>{})){t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"]),this.isSurge()||this.isLoon()?(this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)})):this.isQuanX()?(this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t))):this.isNode()&&(this.initGotEnv(t),this.got(t).on("redirect",(t,e)=>{try{if(t.headers["set-cookie"]){const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}}catch(t){this.logErr(t)}}).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>{const{message:s,response:i}=t;e(s,i,i&&i.body)}))}post(t,e=(()=>{})){if(t.body&&t.headers&&!t.headers["Content-Type"]&&(t.headers["Content-Type"]="application/x-www-form-urlencoded"),t.headers&&delete t.headers["Content-Length"],this.isSurge()||this.isLoon())this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.post(t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)});else if(this.isQuanX())t.method="POST",this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t));else if(this.isNode()){this.initGotEnv(t);const{url:s,...i}=t;this.got.post(s,i).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>{const{message:s,response:i}=t;e(s,i,i&&i.body)})}}time(t,e=null){const s=e?new Date(e):new Date;let i={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let e in i)new RegExp("("+e+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?i[e]:("00"+i[e]).substr((""+i[e]).length)));return t}msg(e=t,s="",i="",r){const o=t=>{if(!t)return t;if("string"==typeof t)return this.isLoon()?t:this.isQuanX()?{"open-url":t}:this.isSurge()?{url:t}:void 0;if("object"==typeof t){if(this.isLoon()){let e=t.openUrl||t.url||t["open-url"],s=t.mediaUrl||t["media-url"];return{openUrl:e,mediaUrl:s}}if(this.isQuanX()){let e=t["open-url"]||t.url||t.openUrl,s=t["media-url"]||t.mediaUrl;return{"open-url":e,"media-url":s}}if(this.isSurge()){let e=t.url||t.openUrl||t["open-url"];return{url:e}}}};if(this.isMute||(this.isSurge()||this.isLoon()?$notification.post(e,s,i,o(r)):this.isQuanX()&&$notify(e,s,i,o(r))),!this.isMuteLog){let t=["","==============📣系统通知📣=============="];t.push(e),s&&t.push(s),i&&t.push(i),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.join(this.logSeparator))}logErr(t,e){const s=!this.isSurge()&&!this.isQuanX()&&!this.isLoon();s?this.log("",`❗️${this.name}, 错误!`,t.stack):this.log("",`❗️${this.name}, 错误!`,t)}wait(t){return new Promise(e=>setTimeout(e,t))}done(t={}){const e=(new Date).getTime(),s=(e-this.startTime)/1e3;this.log("",`🔔${this.name}, 结束! 🕛 ${s} 秒`),this.log(),(this.isSurge()||this.isQuanX()||this.isLoon())&&$done(t)}}(t,e)}