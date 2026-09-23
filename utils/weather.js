/**
 * Open-Meteo 天气服务模块
 * 为行程提供免 Key、高质量的全球及国内天气预报数据
 */

// 常见热门旅游目的地经纬度内置映射（秒出结果，免除 Geocoding 延迟，提高用户体验）
const POPULAR_CITIES = [
  { keywords: ['大理'], name: '大理', lat: 25.606, lon: 100.267 },
  { keywords: ['丽江'], name: '丽江', lat: 26.872, lon: 100.229 },
  { keywords: ['三亚'], name: '三亚', lat: 18.252, lon: 109.511 },
  { keywords: ['莫干山', '德清'], name: '莫干山', lat: 30.563, lon: 119.863 },
  { keywords: ['北京'], name: '北京', lat: 39.904, lon: 116.407 },
  { keywords: ['上海'], name: '上海', lat: 31.230, lon: 121.473 },
  { keywords: ['广州'], name: '广州', lat: 23.129, lon: 113.264 },
  { keywords: ['深圳'], name: '深圳', lat: 22.543, lon: 114.057 },
  { keywords: ['成都'], name: '成都', lat: 30.572, lon: 104.066 },
  { keywords: ['重庆'], name: '重庆', lat: 29.563, lon: 106.551 },
  { keywords: ['杭州'], name: '杭州', lat: 30.274, lon: 120.155 },
  { keywords: ['西安'], name: '西安', lat: 34.341, lon: 108.939 },
  { keywords: ['南京'], name: '南京', lat: 32.060, lon: 118.796 },
  { keywords: ['武汉'], name: '武汉', lat: 30.592, lon: 114.305 },
  { keywords: ['厦门'], name: '厦门', lat: 24.479, lon: 118.089 },
  { keywords: ['青岛'], name: '青岛', lat: 36.067, lon: 120.382 },
  { keywords: ['苏州'], name: '苏州', lat: 31.298, lon: 120.585 },
  { keywords: ['桂林'], name: '桂林', lat: 25.273, lon: 110.290 },
  { keywords: ['黄山'], name: '黄山', lat: 29.714, lon: 118.337 },
  { keywords: ['张家界'], name: '张家界', lat: 29.117, lon: 110.479 },
  { keywords: ['九寨沟', '阿坝'], name: '九寨沟', lat: 33.260, lon: 103.918 },
  { keywords: ['哈尔滨'], name: '哈尔滨', lat: 45.803, lon: 126.534 },
  { keywords: ['拉萨'], name: '拉萨', lat: 29.652, lon: 91.172 },
  { keywords: ['昆明'], name: '昆明', lat: 25.040, lon: 102.712 },
  { keywords: ['西双版纳', '景洪'], name: '西双版纳', lat: 22.001, lon: 100.797 },
  { keywords: ['香港'], name: '香港', lat: 22.319, lon: 114.169 },
  { keywords: ['澳门'], name: '澳门', lat: 22.198, lon: 113.543 },
  { keywords: ['台北'], name: '台北', lat: 25.033, lon: 121.565 },
  { keywords: ['东京'], name: '东京', lat: 35.676, lon: 139.650 },
  { keywords: ['大阪'], name: '大阪', lat: 34.693, lon: 135.502 },
  { keywords: ['曼谷'], name: '曼谷', lat: 13.756, lon: 100.501 },
  { keywords: ['普吉岛', '普吉'], name: '普吉岛', lat: 7.880, lon: 98.392 },
  { keywords: ['新加坡'], name: '新加坡', lat: 1.352, lon: 103.819 }
];

// WMO Weather interpretation codes (WW) 气象代码字典
const WEATHER_CODE_MAP = {
  0: { text: '晴', icon: '☀️' },
  1: { text: '大部晴朗', icon: '🌤️' },
  2: { text: '多云', icon: '⛅' },
  3: { text: '阴天', icon: '☁️' },
  45: { text: '雾', icon: '🌫️' },
  48: { text: '雾凇', icon: '🌫️' },
  51: { text: '小毛毛雨', icon: '🌧️' },
  53: { text: '中毛毛雨', icon: '🌧️' },
  55: { text: '大毛毛雨', icon: '🌧️' },
  56: { text: '冻毛毛雨', icon: '🌧️' },
  57: { text: '密冻毛毛雨', icon: '🌧️' },
  61: { text: '小雨', icon: '🌧️' },
  63: { text: '中雨', icon: '🌧️' },
  65: { text: '大雨', icon: '🌧️' },
  66: { text: '冻雨', icon: '🌨️' },
  67: { text: '大冻雨', icon: '🌨️' },
  71: { text: '小雪', icon: '❄️' },
  73: { text: '中雪', icon: '❄️' },
  75: { text: '大雪', icon: '❄️' },
  77: { text: '雪粒', icon: '🌨️' },
  80: { text: '小阵雨', icon: '🌦️' },
  81: { text: '阵雨', icon: '🌦️' },
  82: { text: '暴雨', icon: '⛈️' },
  85: { text: '阵雪', icon: '🌨️' },
  86: { text: '大阵雪', icon: '🌨️' },
  95: { text: '雷阵雨', icon: '⛈️' },
  96: { text: '雷雨冰雹', icon: '⛈️' },
  99: { text: '暴雷雨冰雹', icon: '⛈️' }
};

// 内存快速缓存
const memoryCache = new Map();

/**
 * 清洗地名：去掉冗余字词，获取关键城市名
 */
function cleanDestination(dest) {
  if (!dest || typeof dest !== 'string') return '';
  let str = dest.trim();
  // 去除常见前缀或行政区修饰后缀以提取核心词
  str = str.replace(/^(中国|国内|境外|国外)[·\-\s]*/g, '');
  return str;
}

/**
 * 匹配内置热门地名坐标
 */
function matchPopularCity(dest) {
  const clean = cleanDestination(dest);
  if (!clean) return null;
  for (const item of POPULAR_CITIES) {
    if (item.keywords.some(kw => clean.includes(kw))) {
      return {
        name: item.name,
        latitude: item.lat,
        longitude: item.lon
      };
    }
  }
  return null;
}

/**
 * 跨环境 HTTP 请求封装（支持小程序 wx.request 与 Node.js 运行环境）
 */
function httpRequest(url) {
  return new Promise((resolve, reject) => {
    if (typeof wx !== 'undefined' && wx.request) {
      wx.request({
        url,
        method: 'GET',
        timeout: 6000,
        success(res) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        },
        fail(err) {
          reject(err);
        }
      });
    } else {
      // Node.js 或测试环境
      const https = require('https');
      https.get(url, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    }
  });
}

/**
 * 根据地名获取经纬度（优先本地词典 -> 降级 Open-Meteo Geocoding）
 */
async function getCoordinates(destination) {
  const matched = matchPopularCity(destination);
  if (matched) {
    return matched;
  }

  const keyword = cleanDestination(destination);
  if (!keyword) return null;

  // 尝试使用 Open-Meteo 官方 Geocoding API 解析
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(keyword)}&count=1&language=zh&format=json`;
  try {
    const data = await httpRequest(geoUrl);
    if (data && data.results && data.results.length > 0) {
      const first = data.results[0];
      return {
        name: first.name || keyword,
        latitude: first.latitude,
        longitude: first.longitude
      };
    }
  } catch (e) {
    console.warn('[Weather] Geocoding request failed:', e.message || e);
  }

  return null;
}

/**
 * 获取 WMO 代码对应的文本和 Emoji
 */
function parseWeatherCode(code) {
  if (WEATHER_CODE_MAP[code]) {
    return WEATHER_CODE_MAP[code];
  }
  if (code >= 50 && code <= 69) return { text: '雨', icon: '🌧️' };
  if (code >= 70 && code <= 79) return { text: '雪', icon: '❄️' };
  if (code >= 80 && code <= 99) return { text: '雷雨', icon: '⛈️' };
  return { text: '多云', icon: '⛅' };
}

/**
 * 主入口：获取行程目的地的 16 天天气预报
 * @param {string} destination 目的地名称
 * @returns {Promise<Object>} 天气格式化数据
 */
async function getTripWeather(destination) {
  const cleanDest = cleanDestination(destination);
  if (!cleanDest) {
    return { success: false, msg: '未指定目的地' };
  }

  // 1. 检查缓存（当天有效）
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const cacheKey = `trip_weather_${cleanDest}_${todayStr}`;

  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey);
  }

  if (typeof wx !== 'undefined' && wx.getStorageSync) {
    try {
      const localCached = wx.getStorageSync(cacheKey);
      if (localCached && localCached.dailyMap) {
        memoryCache.set(cacheKey, localCached);
        return localCached;
      }
    } catch (e) {}
  }

  // 2. 获取经纬度
  const geo = await getCoordinates(cleanDest);
  if (!geo || !geo.latitude || !geo.longitude) {
    return {
      success: false,
      msg: `未找到"${cleanDest}"的气象定位`,
      cityName: cleanDest
    };
  }

  // 3. 请求 Open-Meteo 16 天天气预报
  const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=16`;
  
  try {
    const resData = await httpRequest(forecastUrl);
    if (!resData || !resData.daily || !resData.daily.time) {
      throw new Error('返回气象数据格式异常');
    }

    const { time, weather_code, temperature_2m_max, temperature_2m_min } = resData.daily;
    const dailyMap = {};
    const forecastList = [];

    for (let i = 0; i < time.length; i++) {
      const dateStr = time[i];
      const code = weather_code ? weather_code[i] : 0;
      const maxT = temperature_2m_max ? Math.round(temperature_2m_max[i]) : '--';
      const minT = temperature_2m_min ? Math.round(temperature_2m_min[i]) : '--';
      const meta = parseWeatherCode(code);

      const dayItem = {
        dateStr,
        code,
        text: meta.text,
        icon: meta.icon,
        maxTemp: maxT,
        minTemp: minT,
        tempRange: `${minT}°~${maxT}°`,
        tagText: `${meta.icon} ${maxT}°`
      };

      dailyMap[dateStr] = dayItem;
      forecastList.push(dayItem);
    }

    // 生成近期总体天气摘要
    const todayWeather = dailyMap[todayStr] || forecastList[0] || {};
    const summary = `${todayWeather.icon || '⛅'} ${todayWeather.text || '多云'} ${todayWeather.tempRange || ''}`;

    const result = {
      success: true,
      cityName: geo.name || cleanDest,
      summary,
      todayWeather,
      dailyMap,
      forecastList
    };

    // 写入内存及存储缓存
    memoryCache.set(cacheKey, result);
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      try {
        wx.setStorageSync(cacheKey, result);
      } catch (e) {}
    }

    return result;
  } catch (err) {
    console.warn('[Weather] Fetch forecast failed:', err.message || err);
    return {
      success: false,
      msg: '天气获取受限或网络暂不可用',
      cityName: geo.name || cleanDest
    };
  }
}

module.exports = {
  cleanDestination,
  matchPopularCity,
  getCoordinates,
  parseWeatherCode,
  getTripWeather
};
