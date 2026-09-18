const { createTrip, CHECKLIST_TEMPLATES } = require('../../utils/tripData.js');

Page({
  data: {
    title: '',
    destination: '',
    startDate: '',
    endDate: '',
    members: ['队长'],
    newMemberName: '',
    showEditLeaderModal: false,
    tempLeaderName: '',
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

  // 打开队长名称修改弹窗
  openEditLeaderModal() {
    this.setData({
      showEditLeaderModal: true,
      tempLeaderName: this.data.members[0] || '队长'
    });
  },

  // 关闭队长名称修改弹窗
  closeEditLeaderModal() {
    this.setData({ showEditLeaderModal: false });
  },

  onLeaderNameInput(e) {
    this.setData({ tempLeaderName: e.detail.value || '' });
  },

  // 确认修改队长名称
  confirmEditLeader() {
    const name = (this.data.tempLeaderName || '').trim() || '队长';
    const list = [...this.data.members];
    if (list.slice(1).includes(name)) {
      wx.showToast({ title: '小队中已有同名队员', icon: 'none' });
      return;
    }
    list[0] = name;
    this.setData({
      members: list,
      showEditLeaderModal: false
    });
    wx.showToast({ title: '队长名称已修改', icon: 'success' });
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

  // 移除成员（队长不可移除，点击可修改名称）
  removeMember(e) {
    const idx = e.currentTarget.dataset.index;
    if (idx === 0) {
      this.openEditLeaderModal();
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

