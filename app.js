// app.js
const auth = require('./utils/login.js');
const {iconCategories} = require('./utils/iconData.js');
App({
  onLaunch() {
    this.globalData.openidPromise = this.getOpenid();
  },
  // 获取 openid 的方法，返回 Promise
  getOpenid() {
    return new Promise(async (resolve, reject) => {
      try {
        // 先检查本地缓存
        const cachedUserInfo = wx.getStorageSync('userInfo');
        if (cachedUserInfo && cachedUserInfo.openid) {
          this.globalData.userInfo = cachedUserInfo;
          this.globalData.openidReady = true;
          resolve(cachedUserInfo.openid);
          return;
        }

        // 调用云函数或后端接口获取 openid
        auth.wxLogin()
          .then((data) => {
            this.globalData.openid = data.userInfo.openid;
            this.globalData.userInfo = data.userInfo;
            resolve(data.userInfo.openid)
            // 登录成功后的逻辑
          })
          .catch((err) => {
            wx.hideLoading();
            wx.showToast({ 
              title: err.message || '登录失败', 
              icon: 'none' 
            });
            reject(err);
          });
      } catch (error) {
        reject(error);
      }
    });
  },
  // 提供给页面调用的方法，确保获取到 openid
  ensureOpenid() {
    if (this.globalData.openidReady) {
      return Promise.resolve(this.globalData.userInfo.openid);
    }
    return this.globalData.openidPromise;
  },
  globalData: {
    userInfo: null,
    iconCategories: iconCategories,
    openidReady: false, // 标记 openid 是否已获取
    openidPromise: null // 存储获取 openid 的 Promise
  }
})
