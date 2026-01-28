// 图标分类数据（适配记账小程序）
const iconCategories = {
  // 收入类（income）
  income: [
    { id: 'gongzi', name: '工资', icon: 'gongzi' },
    { id: 'jianzhi', name: '兼职', icon: 'jianzhi' },
    { id: 'licai', name: '理财收益', icon: 'licai' },
    { id: 'lijin', name: '礼金', icon: 'lijin' },
    { id: 'zhuanzhang', name: '转账收入', icon: 'zhuanzhang' },
    { id: 'baoxiao', name: '报销', icon: 'baoxiao' },
    { id: 'qita-income', name: '其他收入', icon: 'qita-60' },
  ],

  // 支出类（expense）- 按消费场景细分
  expense: [
    // 餐饮美食
    { id: 'yongcan', name: '用餐', icon: 'yongcan' },
    { id: 'zaocan', name: '早餐', icon: 'zaocan' },
    { id: 'yinpin', name: '饮品', icon: 'yinpin' },
    { id: 'jiu', name: '酒水', icon: 'jiu' },
    { id: 'lingshi', name: '零食', icon: 'lingshi' },
    { id: 'shuiguo', name: '水果', icon: 'shuiguo' },
    { id: 'maicai', name: '买菜', icon: 'maicai' },
    { id: 'gaodian', name: '糕点', icon: 'gaodian' },

    // 交通出行
    { id: 'chuzuche', name: '出租车', icon: 'chuzuche' },
    { id: 'gongjiao', name: '公交', icon: 'gongjiao' },
    { id: 'jipiao', name: '机票', icon: 'jipiao' },
    { id: 'huoche', name: '火车', icon: 'huoche' },
    { id: 'chalv', name: '车马费', icon: 'chalv' },
    { id: 'jiayou', name: '加油', icon: 'jiayou' },
    { id: 'tingchefei', name: '停车费', icon: 'tingchefei' },

    // 购物消费
    { id: 'gouwu', name: '购物', icon: 'gouwu' },
    { id: 'yifu', name: '衣物', icon: 'yifu' },
    { id: 'shuma', name: '数码', icon: 'shuma' },
    { id: 'jiadian', name: '家电', icon: 'jiadian' },
    { id: 'jiaju', name: '家居', icon: 'jiaju' },
    { id: 'wenju', name: '文具', icon: 'wenju' },
    { id: 'xianhua', name: '鲜花', icon: 'xianhua' },

    // 生活服务
    { id: 'zhuangxiu', name: '装修', icon: 'zhuangxiu' },
    { id: 'shuidian', name: '水电燃气', icon: 'shuidian' },
    { id: 'huafei', name: '话费', icon: 'huafei' },
    { id: 'fangdai', name: '房贷', icon: 'fangdai' },
    { id: 'baoxian', name: '保险', icon: 'baoxian' },
    { id: 'xinyongka', name: '信用卡还款', icon: 'xinyongka' },
    { id: 'chongzhi', name: '充值', icon: 'chongzhi' },
    { id: 'baojianpin', name: '保健品', icon: 'baojianpin' },
    { id: 'gongyi', name: '公益', icon: 'gongyi' },
    { id: 'muying', name: '母婴', icon: 'muying' },
    { id: 'chongwu', name: '宠物', icon: 'chongwu' },

    // 休闲娱乐
    { id: 'dianying', name: '电影', icon: 'dianying' },
    { id: 'yanchanghui', name: '演唱会', icon: 'yanchanghui' },
    { id: 'youxi', name: '游戏', icon: 'youxi' },
    { id: 'lvyou', name: '旅游', icon: 'lvyou' },
    { id: 'xiaoye', name: '宵夜', icon: 'xiaoye' },

    // 美容健康
    { id: 'meifa', name: '美发', icon: 'meifa' },
    { id: 'huazhuang', name: '化妆', icon: 'huazhuang' },
    { id: 'jiuyi', name: '就医', icon: 'jiuyi' },
    { id: 'tijian', name: '体检', icon: 'tijian' },
    { id: 'yundong', name: '运动', icon: 'yundong' },
    { id: 'huxiqi', name: '呼吸机', icon: 'huxiqi' }, // 健康相关
    { id: 'yao', name: '药品', icon: 'yao' },
    { id: 'tuinabaojian', name: '推拿保健', icon: 'tuinabaojian' },

    // 教育学习
    { id: 'xuefei', name: '学费', icon: 'xuefei' },
    { id: 'peixunfei', name: '培训费', icon: 'peixunfei' },
    { id: 'jiaocai', name: '教材', icon: 'jiaocai' },

    // 人情社交
    { id: 'liwu', name: '礼物', icon: 'liwu' },

    // 其他支出
    { id: 'qita-expense', name: '其他支出', icon: 'qita-60' }
  ],

  // 功能类（非收支，用于按钮/页面功能）
  functional: [
    { id: 'jizhang', name: '记账', icon: 'jizhang' },
    { id: 'bianji', name: '编辑', icon: 'bianji' },
    { id: 'shezhi', name: '设置', icon: 'shezhi' },
    { id: 'tongji', name: '统计', icon: 'tongji' },
    { id: 'mingxi', name: '明细', icon: 'mingxi' },
  ]
};

module.exports = { iconCategories };