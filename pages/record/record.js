const app = getApp();
const supabase = require('../../utils/supabase.js');
const {income, expense} = app.globalData.iconCategories;
Page({
  data: {
    type: 'expense', // 默认选择支出
    amount: '',
    note: '',
    date: '',
    selectedCategory: '',
    selectedCategoryName: '',
    focusAmount: true,
    canSave: false,
    categories: {
      income,
      expense
    }
  },

  onLoad(options) {
    // 从URL参数获取记账类型
    if (options.type) {
      this.setData({
        type: options.type
      });
    }
    if(options.id) {
      this.getBillById(options.id);
    }
    
    // 设置默认日期为今天
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    this.setData({
      date: `${year}-${month}-${day}`
    });

    // 默认选中第一个分类
    const defaultCategory = this.data.categories[this.data.type][0].id;
    const defaultCategoryName = this.data.categories[this.data.type][0].name;
    this.setData({
      selectedCategory: defaultCategory,
      selectedCategoryName: defaultCategoryName
    });

    // 检查保存按钮状态
    this.checkSaveStatus();
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
    this.setData({
      id: billItem.id,
      type: billItem.type, // 默认选择支出
      amount: billItem.amount,
      note: billItem.remarks,
      date: billItem.date,
      selectedCategory: billItem.icon,
      selectedCategoryName: billItem.text,
    })
  },
  // 选择记账类型（收入/支出）
  selectType(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      type,
      selectedCategory: this.data.categories[type][0].id, // 切换类型时默认选中第一个分类
      selectedCategoryName: this.data.categories[type][0].name // 切换类型时默认选中第一个分类
    }, () => {
      this.checkSaveStatus();
    });
  },

  // 金额输入处理
  onAmountInput(e) {
    let amount = e.detail.value;
    
    // 格式化金额输入，保留两位小数
    if (amount.includes('.')) {
      const parts = amount.split('.');
      if (parts[1].length > 2) {
        amount = parts[0] + '.' + parts[1].substring(0, 2);
      }
    }
    
    this.setData({
      amount
    }, () => {
      this.checkSaveStatus();
    });
  },

  // 选择分类
  selectCategory(e) {
    this.setData({
      selectedCategory: e.currentTarget.dataset.id,
      selectedCategoryName: e.currentTarget.dataset.name,
    }, () => {
      this.checkSaveStatus();
    });
  },

  // 备注输入处理
  onNoteInput(e) {
    this.setData({
      note: e.detail.value
    });
  },

  // 日期选择处理
  onDateChange(e) {
    this.setData({
      date: e.detail.value
    });
  },

  // 检查是否可以保存（金额和分类都已填写）
  checkSaveStatus() {
    const canSave = this.data.amount && this.data.amount !== '0' && this.data.amount !== '0.0' && this.data.amount !== '0.00' && this.data.selectedCategory;
    this.setData({
      canSave
    });
  },

  // 保存记账记录
  async saveRecord() {
    // 验证数据
    if (!this.data.canSave) {
      wx.showToast({
        title: '请填写完整信息',
        icon: 'none'
      });
      return;
    }
    const userInfo = {};
    const userOpenid = app.globalData?.openid || wx.getStorageSync('userInfo')?.openid;
    if (!userOpenid) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }
    // 拆分年月日
    const dateParts = this.data.date.split('-');
    const [y, m, d] = dateParts;
    const m_w = `${m}-${new Date(this.data.date).getDate()}`; // 月-日
    
    // 构建记录数据
    const record = {
      _id: Date.now().toString(), // 使用时间戳作为ID
      openid: userOpenid,
      _openid: userOpenid,
      type: this.data.type,
      amount: this.data.amount,
      hisprice: this.data.amount, // 同时保存到 hisprice 字段
      act: this.data.selectedCategoryName, // 使用 act 字段存储分类
      text: this.data.selectedCategoryName, // 也保存到 text 字段
      remarks: this.data.note || '', // 备注
      date: this.data.date,
      y: y || '',
      m: m || '',
      d: d || '',
      m_w: m_w || '',
      icon: this.data.selectedCategory, // 图标
      paytype: '', // 支付方式
      payment:'', // 支付账户
      payall: '0', // 可根据需要设置
      w: new Date(this.data.date).getDay().toString(), // 星期几
      
      // 用户信息字段
      province: userInfo.province || '',
      city: userInfo.city || '',
      country: userInfo.country || '',
      gender: userInfo.gender || '未知',
      avatarUrl: userInfo.avatarUrl || '',
      nickname: userInfo.nickName || '微信用户'
    };
    try {
      if(this.data.id) {
        // 更新数据到 Supabase
        const { data, error } = await supabase.update('wxapp', record, [
          { column: 'id', operator: 'eq', value: this.data.id },
          { column: '_openid', operator: 'eq', value: userOpenid }
        ]);
        if (error) {
          throw error;
        }
      } else{
        // 插入数据到 Supabase
        const { data, error } = await supabase.insert('wxapp', record);
        if (error) {
          throw error;
        }
      }

      wx.hideLoading();
      wx.showToast({
        title: '保存成功',
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
            
            if (prevPage && typeof prevPage.loadBillDetail === 'function') {
              prevPage.loadBillDetail(); // 触发前页数据刷新
            }
            if (prevPage && typeof prevPage.loadBills === 'function') {
              prevPage.loadBills(); // 触发前页数据刷新
            }
          }
        });
      }, 1500);

    } catch (error) {
      console.error('保存失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '保存失败，请重试',
        icon: 'none'
      });
    }
  }
})