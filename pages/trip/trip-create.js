const { createTrip, CHECKLIST_TEMPLATES } = require('../../utils/tripData.js');

Page({
  data: {
    title: '',
    destination: '',
    startDate: '',
    endDate: '',
    members: ['我'],
    newMemberName: '',
    selectedTemplate: 'general',
    templates: [
      { key: 'general', name: '国内出行通用必备', desc: '含证件、衣物、药品洗漱、数码配件等 12 项必带清单' },
      { key: 'camping', name: '户外露营装备清单', desc: '含帐篷天幕、炊事锅具、防蚊照明等 9 项露营清单' }
    ]
  },

  onLoad(options) {
    const today = new Date();
    const y = today.getFullYear();
    const m = (today.getMonth() + 1).toString().padStart(2, '0');
    const d = today.getDate().toString().padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    this.setData({
      startDate: dateStr,
      endDate: dateStr
    });
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value });
  },

  onDestInput(e) {
    this.setData({ destination: e.detail.value });
  },

  onStartDateChange(e) {
    this.setData({ startDate: e.detail.value });
  },

  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value });
  },

  onNewMemberInput(e) {
    this.setData({ newMemberName: e.detail.value });
  },

  // 添加成员
  addMember() {
    const name = this.data.newMemberName.trim();
    if (!name) {
      wx.showToast({ title: '请输入成员姓名', icon: 'none' });
      return;
    }
    if (this.data.members.includes(name)) {
      wx.showToast({ title: '成员已存在', icon: 'none' });
      return;
    }
    this.setData({
      members: [...this.data.members, name],
      newMemberName: ''
    });
  },

  // 移除成员（“我”不可移除）
  removeMember(e) {
    const idx = e.currentTarget.dataset.index;
    if (this.data.members[idx] === '我') {
      wx.showToast({ title: '本人不可移除', icon: 'none' });
      return;
    }
    const list = [...this.data.members];
    list.splice(idx, 1);
    this.setData({ members: list });
  },

  // 选择模板
  selectTemplate(e) {
    this.setData({ selectedTemplate: e.currentTarget.dataset.key });
  },

  // 提交创建
  submitCreate() {
    const { title, destination, startDate, endDate, members, selectedTemplate } = this.data;
    if (!title.trim()) {
      wx.showToast({ title: '请填写活动名称', icon: 'none' });
      return;
    }

    const newTrip = createTrip({
      title: title.trim(),
      destination: destination.trim() || '随性游',
      startDate,
      endDate,
      members,
      template: selectedTemplate
    });

    wx.showToast({ title: '创建成功', icon: 'success' });
    setTimeout(() => {
      wx.redirectTo({
        url: `/pages/trip/trip-detail?id=${newTrip.id}`
      });
    }, 1000);
  }
});

