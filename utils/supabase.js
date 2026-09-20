// Supabase 配置
const SUPABASE_PROXY_URL = 'https://supabaseproxy.val.run';
const SUPABASE_DIRECT_URL = 'https://dxzmebuimxtfznmcdwht.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4em1lYnVpbXh0ZnpubWNkd2h0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTI3MzMxMTMsImV4cCI6MjAyODMwOTExM30.HrTOiN3nsf6EJBcq8nw5ZpO5H23g5OZ8oSN1f-fPq0Q';

// 当前使用的 URL（优先代理，失败自动降级到直连）
let activeUrl = SUPABASE_PROXY_URL;

function wxRequestPromise(options) {
  return new Promise((resolve, reject) => {
    wx.request({
      ...options,
      success: (res) => resolve(res),
      fail: (err) => reject(err)
    });
  });
}

// 初始化 Supabase 客户端
function createClient() {
  // 构建完整请求 URL 的辅助方法
  function buildQueryUrl(baseUrl, table, { select, filters, order, desc, from, to }) {
    let url = `${baseUrl}/rest/v1/${table}?select=${select}`;
    filters.forEach(filter => {
      const { column, operator, value } = filter;
      url += `&${column}=${operator}.${encodeURIComponent(value)}`;
    });
    url += `&order=${order}.${desc ? 'desc' : 'asc'}`;
    url += `&limit=${to - from + 1}&offset=${from}`;
    return url;
  }

  // 带自动降级的请求：代理失败时切换到直连重试
  async function requestWithFallback(requestFn) {
    try {
      return await requestFn(activeUrl);
    } catch (primaryError) {
      // 如果当前已经是直连，不再重试
      if (activeUrl === SUPABASE_DIRECT_URL) {
        throw primaryError;
      }
      console.warn('[Supabase] 代理请求失败，尝试直连降级:', primaryError.errMsg || primaryError);
      try {
        const result = await requestFn(SUPABASE_DIRECT_URL);
        // 直连成功，后续请求也切换到直连
        activeUrl = SUPABASE_DIRECT_URL;
        console.log('[Supabase] 已自动降级为直连 Supabase');
        return result;
      } catch (fallbackError) {
        console.error('[Supabase] 直连也失败:', fallbackError.errMsg || fallbackError);
        // 两个都失败，抛出原始错误
        throw primaryError;
      }
    }
  }

  return {
    key: supabaseKey,
    
    // 封装请求方法
    async query(table, options = {}) {
      const { 
        select = '*', 
        from = 0, 
        to = 20, 
        order = 'created_at', 
        desc = true,
        filters = []
      } = options;
      
      try {
        return await requestWithFallback(async (baseUrl) => {
          const url = buildQueryUrl(baseUrl, table, { select, filters, order, desc, from, to });
          return await wxRequestPromise({
            url,
            header: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            }
          });
        });
      } catch (error) {
        return Promise.reject({
          data: null,
          error
        });
      }
    },
    
    // 插入数据
    async insert(table, data) {
      try {
        const response = await requestWithFallback(async (baseUrl) => {
          return await wxRequestPromise({
            url: `${baseUrl}/rest/v1/${table}`,
            method: 'POST',
            header: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            data
          });
        });
        
        return {
          data: response.data,
          error: null
        };
      } catch (error) {
        return {
          data: null,
          error
        };
      }
    },
    // 更新数据
    async update(table, data, filters = []) {
      try {
        if (filters.length === 0) {
          throw new Error('更新操作必须提供筛选条件');
        }
        
        const response = await requestWithFallback(async (baseUrl) => {
          let url = `${baseUrl}/rest/v1/${table}?`;
          filters.forEach((filter, index) => {
            const { column, operator, value } = filter;
            if (index > 0) url += '&';
            url += `${column}=${operator}.${encodeURIComponent(value)}`;
          });
          
          return await wxRequestPromise({
            url: url,
            method: 'PATCH',
            header: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            data: data
          });
        });
        
        // 处理响应
        if (response.statusCode >= 400) {
          return {
            data: null,
            error: new Error(`更新失败: ${response.data?.message || response.statusCode}`)
          };
        }
        
        return {
          data: response.data,
          error: null
        };
      } catch (error) {
        return {
          data: null,
          error
        };
      }
    },
    // 删除数据
    async delete(table, filters = []) {
      try {
        if (filters.length === 0) {
          throw new Error('删除操作必须提供筛选条件');
        }
        const response = await requestWithFallback(async (baseUrl) => {
          let url = `${baseUrl}/rest/v1/${table}?`;
          filters.forEach((filter, index) => {
            const { column, operator, value } = filter;
            if (index > 0) url += '&';
            url += `${column}=${operator}.${encodeURIComponent(value)}`;
          });
          return await wxRequestPromise({
            url: url,
            method: 'DELETE',
            header: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            }
          });
        });
        return {
          data: response.data,
          error: null
        };
      } catch (error) {
        return {
          data: null,
          error
        };
      }
    },
    // 聚合查询（求和）
    async sum(table, column, filters = []) {
      try {
        const response = await requestWithFallback(async (baseUrl) => {
          let url = `${baseUrl}/rest/v1/${table}?select=${column}(sum)`;
          filters.forEach(filter => {
            const { column, operator, value } = filter;
            url += `&${column}=${operator}.${encodeURIComponent(value)}`;
          });
          return await wxRequestPromise({
            url,
            method: 'GET',
            header: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            }
          });
        });
        
        return {
          data: response.data[0]?.[column]?.sum || 0,
          error: null
        };
      } catch (error) {
        return {
          data: 0,
          error
        };
      }
    }
  };
}

module.exports = createClient();