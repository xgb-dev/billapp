const app = getApp();
const supabase = require('../../utils/supabase.js');
const {income, expense} = app.globalData.iconCategories;

Page({
  data: {
    billId: '',
    bill: {}
  },

  onLoad(options) {
    if (options.id) {
      this.setData({
        billId: options.id
      });
      
      // 加载账单详情
      this.loadBillDetail();
    } else {
      wx.showToast({
        title: '账单不存在',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  // 加载账单详情
  async loadBillDetail() {
    // 模拟从API或本地缓存获取账单详情
    const bill = await this.getBillById(this.data.billId);
    console.log('bill:::',bill)
    console.log(this.data)
    
    if (bill) {
      this.setData({
        bill
      });
      
      // 设置页面标题
      wx.setNavigationBarTitle({
        title: bill.type === 'income' ? '收入详情' : '支出详情'
      });
      
      // 设置顶部状态栏颜色
      wx.setNavigationBarColor({
        frontColor: '#ffffff',
        backgroundColor: bill.type === 'income' ? '#4caf50' : '#f44336'
      });
    } else {
      wx.showToast({
        title: '账单不存在',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  // 根据ID获取账单
  async getBillById(id) {
    // 模拟数据，实际项目中应从数据库或API获取
    const {data: bills} = await supabase.query('wxapp', {
      select: '*',
      filters: [
        { column: 'id', operator: 'eq', value: id } // 使用实际的 openid 字段
      ],
      order: 'date', // 按日期排序
      desc: true
    });
    let billItem = bills.find(bill => bill.id == id);
    if(billItem.type == 'in') billItem.type = 'income'
    if(billItem.type == 'out') billItem.type = 'expense'
    return billItem;
  },

  // 格式化日期显示
  formatDate(dateStr) {
    if (!dateStr) return '';
    
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const week = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
    
    return `${year}年${month}月${day}日 星期${week}`;
  },

  // 格式化日期时间显示
  formatDateTime(dateStr) {
    if (!dateStr) return '';
    
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  },

  // 编辑账单
  editBill() {
    wx.navigateTo({
      url: `/pages/record/record?type=${this.data.bill.type}&id=${this.data.billId}`
    });
  },

  // 删除账单
  deleteBill() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条账单记录吗？此操作不可恢复。',
      cancelText: '取消',
      confirmText: '删除',
      confirmColor: '#f44336',
      success: (res) => {
        if (res.confirm) {
          // 执行删除操作
          this.performDelete();
        }
      }
    });
  },

  // 执行删除操作
  async performDelete() {
    // 这里替换为真实的删除逻辑
    try {
      if(this.data.billId) {
        // 更新数据到 Supabase
        const { data, error } = await supabase.update('wxapp', {trash: 1}, [
          { column: 'id', operator: 'eq', value: this.data.billId }
        ]);
        if (error) {
          throw error;
        }
      } 

      wx.hideLoading();
      wx.showToast({
        title: '删除成功',
        icon: 'success'
      });

      // 保存成功后返回上一页
      setTimeout(() => {
        wx.navigateBack({
          delta: 1, // 返回上一页（delta=2 则返回上两页）
          success: () => {
            // 3. 关键：获取前一页实例，调用刷新方法
            const pages = getCurrentPages(); // 获取当前页面栈
            const prevPage = pages[pages.length - 1]; // 前一页（索引-2）
            
            // 调用前一页的刷新方法（需前页定义该方法）
            if (prevPage && typeof prevPage.loadAccountData === 'function') {
              prevPage.loadAccountData(); // 触发前页数据刷新
            }
          }
        });
      }, 1500);

    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: '删除失败，请重试',
        icon: 'none'
      });
    }
  }
})