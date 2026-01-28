// 登录流程封装
function wxLogin() {
  return new Promise((resolve, reject) => {
    // 1. 获取登录凭证code
    wx.login({
      success: (loginRes) => {
        if (loginRes.code) {
          authWithServer(loginRes.code)
          .then(res => resolve(res))
          .catch(err => reject(err));
        } else {
          reject(new Error('获取code失败: ' + loginRes.errMsg));
        }
      },
      fail: (err) => {
        reject(new Error('登录失败: ' + err.errMsg));
      }
    });
  });
}

// 与服务器交互获取登录态
function authWithServer(code, userInfo = null) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: 'https://wxopenid.val.run', // 替换为你的后端接口
      method: 'GET',
      data: {
        code: code,
        userInfo: userInfo,
      },
      success: (res) => {
        console.log(res)
        if (res.statusCode == 200 && res.data.success) {
          // 4. 保存登录态到本地
          wx.setStorageSync('userInfo', res.data.data.userInfo);
          wx.setStorageSync('loginTime', Date.now());
          
          resolve(res.data.data);
        } else {
          reject(new Error('服务器登录失败: ' + (res.data.message || '未知错误')));
        }
      },
      fail: (err) => {
        reject(new Error('网络请求失败: ' + err.errMsg));
      }
    });
  });
}

// 检查登录状态是否有效
function checkLoginStatus() {
  const token = wx.getStorageSync('token');
  const loginTime = wx.getStorageSync('loginTime');
  
  // 简单的有效期检查（示例：7天有效期）
  const isExpired = loginTime && (Date.now() - loginTime > 7 * 24 * 60 * 60 * 1000);
  
  return !!token && !isExpired;
}

// 登出功能
function logout() {
  return new Promise((resolve) => {
    // 清除本地存储
    wx.removeStorageSync('token');
    wx.removeStorageSync('userInfo');
    wx.removeStorageSync('loginTime');
    
    // 可选：通知服务器登出
    wx.request({
      url: 'https://your-server-domain/api/logout',
      method: 'POST',
      header: {
        'Authorization': 'Bearer ' + wx.getStorageSync('token')
      },
      complete: () => {
        resolve();
      }
    });
  });
}

module.exports = {
  wxLogin,
  checkLoginStatus,
  logout
};