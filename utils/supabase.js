// Supabase 配置
const supabaseUrl = 'https://dxzmebuimxtfznmcdwht.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4em1lYnVpbXh0ZnpubWNkd2h0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTI3MzMxMTMsImV4cCI6MjAyODMwOTExM30.HrTOiN3nsf6EJBcq8nw5ZpO5H23g5OZ8oSN1f-fPq0Q';

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
  return {
    url: supabaseUrl,
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
        // 构建请求 URL
        let url = `${this.url}/rest/v1/${table}?select=${select}`;
        
        // 添加筛选条件
        filters.forEach(filter => {
          const { column, operator, value } = filter;
          url += `&${column}=${operator}.${encodeURIComponent(value)}`;
        });
        
        // 添加排序
        url += `&order=${order}.${desc ? 'desc' : 'asc'}`;
        
        // 添加分页
        url += `&limit=${to - from + 1}&offset=${from}`;
        
        // 发送请求
        return await wxRequestPromise({
          url,
          header: {
            'apikey': this.key,
            'Authorization': `Bearer ${this.key}`,
            'Content-Type': 'application/json'
          }
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
        const response = await wxRequestPromise({
          url: `${this.url}/rest/v1/${table}`,
          method: 'POST',
          header: {
            'apikey': this.key,
            'Authorization': `Bearer ${this.key}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          data
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
        
        // 构建请求 URL 并添加筛选条件
        let url = `${this.url}/rest/v1/${table}?`;
        filters.forEach((filter, index) => {
          const { column, operator, value } = filter;
          if (index > 0) url += '&';
          url += `${column}=${operator}.${encodeURIComponent(value)}`;
        });
        
        // 发送 PATCH 请求更新数据
        const response = await wxRequestPromise({
          url: url,
          method: 'PATCH',
          header: {
            'apikey': this.key,
            'Authorization': `Bearer ${this.key}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          data: data
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
        let url = `${this.url}/rest/v1/${table}?`;
        filters.forEach((filter, index) => {
          const { column, operator, value } = filter;
          if (index > 0) url += '&';
          url += `${column}=${operator}.${encodeURIComponent(value)}`;
        });
        const response = await wxRequestPromise({
          url: url,
          method: 'DELETE',
          header: {
            'apikey': this.key,
            'Authorization': `Bearer ${this.key}`,
            'Content-Type': 'application/json'
          }
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
        let url = `${this.url}/rest/v1/${table}?select=${column}(sum)`;
        
        // 添加筛选条件
        filters.forEach(filter => {
          const { column, operator, value } = filter;
          url += `&${column}=${operator}.${encodeURIComponent(value)}`;
        });
        
        const response = await wxRequestPromise({
          url,
          method: 'GET',
          header: {
            'apikey': this.key,
            'Authorization': `Bearer ${this.key}`,
            'Content-Type': 'application/json'
          }
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