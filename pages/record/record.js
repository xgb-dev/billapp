const app = getApp();
const supabase = require('../../utils/supabase.js');
const {income, expense} = app.globalData.iconCategories;

Page({
  data: {
    type: 'expense', // 默认选择支出
    amount: '',
    amountExpr: '',
    evalPreview: '',
    isOperating: false,
    note: '',
    date: '',
    selectedCategory: '',
    selectedCategoryName: '',
    canSave: false,
    categories: {
      income,
      expense
    }
  },

  onLoad(options) {
    if (options.type) {
      this.setData({
        type: options.type
      });
    }
    if (options.id) {
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

    this.checkSaveStatus();
  },

  // 根据ID获取账单
  async getBillById(id) {
    const {data: bills} = await supabase.query('wxapp', {
      select: '*',
      filters: [
        { column: 'id', operator: 'eq', value: id }
      ],
      order: 'date',
      desc: true
    });
    let billItem = (bills || []).find(bill => bill.id == id);
    if (!billItem) return;
    if (billItem.type == 'in') billItem.type = 'income';
    if (billItem.type == 'out') billItem.type = 'expense';

    const amt = String(billItem.amount || billItem.hisprice || '');
    this.setData({
      id: billItem.id,
      type: billItem.type,
      amount: amt,
      amountExpr: amt,
      note: billItem.remarks || '',
      date: billItem.date || '',
      selectedCategory: billItem.icon,
      selectedCategoryName: billItem.text,
    }, () => {
      this.checkSaveStatus();
    });
  },

  // 选择记账类型（收入/支出）
  selectType(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      type,
      selectedCategory: this.data.categories[type][0].id,
      selectedCategoryName: this.data.categories[type][0].name
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

  // 自定义数字与计算键盘按键处理
  handleKeypad(e) {
    const key = e.currentTarget.dataset.key;
    let expr = this.data.amountExpr;

    if (key >= '0' && key <= '9') {
      // 处理前导0
      const lastSegment = this.getLastSegment(expr);
      if (lastSegment === '0' && key === '0') {
        return;
      }
      if (lastSegment === '0') {
        expr = expr.slice(0, -1) + key;
      } else {
        // 小数位限制：当前段小数点后最多两位
        if (lastSegment.includes('.')) {
          const decimals = lastSegment.split('.')[1];
          if (decimals && decimals.length >= 2) {
            return;
          }
        }
        // 长度防溢出保护
        if (expr.length < 15) {
          expr += key;
        }
      }
    } else if (key === '.') {
      const lastSegment = this.getLastSegment(expr);
      if (lastSegment.includes('.')) {
        return; // 已有小数点
      }
      if (lastSegment === '' || lastSegment === '+' || lastSegment === '-') {
        expr += '0.';
      } else {
        expr += '.';
      }
    } else if (key === '+' || key === '-') {
      if (!expr) return; // 开头不能为运算符
      const lastChar = expr.slice(-1);
      if (lastChar === '+' || lastChar === '-') {
        // 替换最后一个运算符
        expr = expr.slice(0, -1) + key;
      } else {
        // 检查之前是否已经有计算式，例如 10+5，再次按 + 时先算出结果再追加
        if (this.hasOperator(expr)) {
          const evaluated = this.evaluateExpr(expr);
          expr = evaluated + key;
        } else {
          expr += key;
        }
      }
    } else if (key === 'del') {
      // 退格删除
      expr = expr.slice(0, -1);
    } else if (key === 'clear') {
      // 清空
      expr = '';
    }

    this.updateExpressionState(expr);
  },

  // 获取表达式中的最后一个数字段
  getLastSegment(expr) {
    const parts = expr.split(/[+\-]/);
    return parts[parts.length - 1] || '';
  },

  // 判断是否已包含运算符
  hasOperator(expr) {
    return expr.includes('+') || (expr.includes('-') && expr.indexOf('-') > 0);
  },

  // 计算表达式求值
  evaluateExpr(expr) {
    if (!expr) return '0';
    // 如果末尾是运算符，去除末尾运算符
    let cleanExpr = expr.trim();
    if (cleanExpr.endsWith('+') || cleanExpr.endsWith('-')) {
      cleanExpr = cleanExpr.slice(0, -1);
    }

    // 简单加减法计算
    const match = cleanExpr.match(/^(\d+(?:\.\d+)?)\s*([+\-])\s*(\d+(?:\.\d+)?)$/);
    if (match) {
      const num1 = parseFloat(match[1]) || 0;
      const op = match[2];
      const num2 = parseFloat(match[3]) || 0;
      let res = op === '+' ? num1 + num2 : num1 - num2;
      if (res < 0) res = 0; // 金额不为负
      // 精确到两位小数并去除末尾无效0
      return String(Math.round(res * 100) / 100);
    }
    return cleanExpr;
  },

  // 刷新计算式状态与预览
  updateExpressionState(expr) {
    const isOperating = this.hasOperator(expr);
    let evalPreview = '';
    let finalAmount = expr;

    if (isOperating) {
      const evalRes = this.evaluateExpr(expr);
      evalPreview = `= ¥${evalRes}`;
      finalAmount = evalRes;
    }

    this.setData({
      amountExpr: expr,
      amount: finalAmount,
      evalPreview,
      isOperating
    }, () => {
      this.checkSaveStatus();
    });
  },

  // 点击等号键进行计算结算
  handleEqual() {
    if (this.data.isOperating) {
      const res = this.evaluateExpr(this.data.amountExpr);
      this.setData({
        amountExpr: res,
        amount: res,
        evalPreview: '',
        isOperating: false
      }, () => {
        this.checkSaveStatus();
      });
    }
  },

  // 检查是否可以保存
  checkSaveStatus() {
    const amt = parseFloat(this.data.amount) || 0;
    const canSave = amt > 0 && !!this.data.selectedCategory;
    this.setData({
      canSave
    });
  },

  // 主动作按钮处理（当有算式时点击自动计算，当已有金额时直接保存）
  handlePrimaryAction() {
    if (this.data.isOperating) {
      this.handleEqual();
      return;
    }
    this.saveRecord();
  },

  // 保存记账记录
  async saveRecord() {
    // 若当前包含运算式，先结算最终金额
    if (this.data.isOperating) {
      this.handleEqual();
    }

    if (!this.data.canSave) {
      wx.showToast({
        title: '请输入金额并选择分类',
        icon: 'none'
      });
      return;
    }

    const userOpenid = app.globalData?.openid || wx.getStorageSync('userInfo')?.openid;
    if (!userOpenid) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({
      title: '正在保存...',
      mask: true
    });

    const finalAmountStr = parseFloat(this.data.amount || '0').toFixed(2);
    const dateParts = this.data.date.split('-');
    const [y, m, d] = dateParts;
    const m_w = `${m}-${new Date(this.data.date).getDate()}`;

    const record = {
      _id: Date.now().toString(),
      openid: userOpenid,
      _openid: userOpenid,
      type: this.data.type,
      amount: finalAmountStr,
      hisprice: finalAmountStr,
      act: this.data.selectedCategoryName,
      text: this.data.selectedCategoryName,
      remarks: this.data.note || '',
      date: this.data.date,
      y: y || '',
      m: m || '',
      d: d || '',
      m_w: m_w || '',
      icon: this.data.selectedCategory,
      paytype: '',
      payment: '',
      payall: '0',
      w: new Date(this.data.date).getDay().toString(),
      province: '',
      city: '',
      country: '',
      gender: '未知',
      avatarUrl: '',
      nickname: '微信用户'
    };

    try {
      if (this.data.id) {
        const { error } = await supabase.update('wxapp', record, [
          { column: 'id', operator: 'eq', value: this.data.id },
          { column: '_openid', operator: 'eq', value: userOpenid }
        ]);
        if (error) throw error;
      } else {
        const { error } = await supabase.insert('wxapp', record);
        if (error) throw error;
      }

      wx.hideLoading();
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      });

      // 保存成功后返回上一页并刷新前页数据
      setTimeout(() => {
        wx.navigateBack({
          delta: 1,
          success: () => {
            const pages = getCurrentPages();
            const prevPage = pages[pages.length - 1];
            if (prevPage) {
              if (typeof prevPage.loadAccountData === 'function') prevPage.loadAccountData();
              if (typeof prevPage.loadBillDetail === 'function') prevPage.loadBillDetail();
              if (typeof prevPage.loadBills === 'function') prevPage.loadBills();
            }
          }
        });
      }, 1200);

    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: '保存失败，请重试',
        icon: 'none'
      });
    }
  }
});