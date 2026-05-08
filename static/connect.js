

//1.监听点击等事件
//获取元素
const fileInput = document.getElementById('fileInput'); //输入
const recognizeBtn = document.getElementById('recognizeBtn'); //识别按钮
const preview = document.getElementById('preview'); //预览
const result = document.getElementById('result'); //识别结果

//监听
//选择按钮
fileInput.addEventListener('click', function() {
    console.log('fileclick');
});

let currentProduct = null;

//2.接收图片
let fileSelected = null;
fileInput.addEventListener('change', function() {
    fileSelected = this.files[0];
    console.log(fileSelected);

    //创建预览
    if (fileSelected) {
      const reader = new FileReader();
      reader.onload = function() {
        const preview = document.getElementById('preview');  //获取地址
        preview.src = reader.result;  //将图片地址赋值给preview
        preview.style.display = 'block'
      }
      //读取
      reader.readAsDataURL(fileSelected);
    }
});


//3.api连接至server.py，再接到到大模型并传图片

// 平台配置：名称、图标（可选）、搜索链接模板
const platforms = [
    {
        name: '淘宝',
        url: 'https://s.taobao.com/search?q='
    },
    {
        name: '京东',
        url: 'https://search.jd.com/Search?keyword='
    },
    {
        name: '拼多多',
        url: 'https://yangkeduo.com/search_result.html?search_key='
    },
    {
        name: '百度',
        url: 'https://www.baidu.com/s?wd='
    }
];


recognizeBtn.addEventListener('click', async function() {
  if (!fileSelected) {
    alert('请选择图片');
    return;
  }

  //等待
  recognizeBtn.disabled = true;
  recognizeBtn.textContent = '识别中，请等待...';

  //上传图片
  const formData = new FormData();
  formData.append('file', fileSelected);

  try {
    const response = await fetch('/recognize', {
        method: 'POST',
        body: formData
    });
    const data = await response.json();

    // ========== 新增：处理结构化数据 ==========
    const itemInfo = data.result;
    const resultDetails = document.getElementById('resultDetails');
    
    let detailsHtml = '';
    if (typeof itemInfo === 'object' && itemInfo !== null) {
      detailsHtml = `
          <div style="margin-top: 10px; line-height: 1.8;">
              <div><strong> 名称：</strong> ${itemInfo.name || '未知'}</div>
              <div><strong> 颜色：</strong> ${itemInfo.color || '未知'}</div>
              <div><strong> 材质：</strong> ${itemInfo.material || '未知'}</div>
              <div><strong> 形状：</strong> ${itemInfo.shape || '未知'}</div>
              <div><strong> 特征：</strong> ${itemInfo.feature || '无'}</div>
          </div>
      `;
    } else {
        detailsHtml = `<div>${data.result}</div>`;
    }
    
    resultDetails.innerHTML = detailsHtml;
    result.style.display = 'block';

    // ========== 生成搜索按钮 ==========
    const searchLinksDiv = document.getElementById('searchLinks');
    searchLinksDiv.innerHTML = '';
    
    // 使用物品名称（优先用结构化数据中的 name）
    const searchName = (itemInfo && itemInfo.name) ? itemInfo.name : data.item_name;
    const itemName = encodeURIComponent(searchName || '物品');
    
    platforms.forEach(platform => {
        const btn = document.createElement('a');
        btn.href = platform.url + itemName;
        btn.target = '_blank';
        btn.rel = 'noopener noreferrer';
        btn.className = 'search-btn';
        btn.innerHTML = `${platform.icon} ${platform.name}搜索`;
        searchLinksDiv.appendChild(btn);
    });


    // 识别成功后，显示聊天区域并记录当前商品
    const chatContainer = document.getElementById('chatContainer');
    chatContainer.style.display = 'block';
    currentProduct = data.item_name;

    // 清空旧的聊天记录
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '<div style="color: #ccc; text-align: center; padding: 20px;">已识别到：' + currentProduct + '，可以查询选购建议</div>';


  //识别完成后，启用按钮
  } catch (error) {
      alert('识别失败：' + error.message);
      console.error('错误:', error);
      
  } finally {
      // 识别后：恢复按钮
      recognizeBtn.disabled = false;
      recognizeBtn.textContent = '开始识别';
  }

  

});


// ========== 聊天功能 ==========
const sendBtn = document.getElementById('sendChatBtn');
const chatInput = document.getElementById('chatInput');
let sessionId = localStorage.getItem('chat_session_id');
if (!sessionId) {
    sessionId = 'session_' + Date.now() + '_' + Math.random();
    localStorage.setItem('chat_session_id', sessionId);
}

async function sendMessage() {
    const message = chatInput.value.trim();
    
    // 显示用户消息
    const chatMessages = document.getElementById('chatMessages');
    const userMsgDiv = document.createElement('div');
    userMsgDiv.style.cssText = 'text-align: right; margin: 8px 0;';
    userMsgDiv.innerHTML = `<span style="background: linear-gradient(90deg, white 0%, rgba(15, 51, 197, 0.2) 100%); padding: 8px 14px; border-radius: 18px; display: inline-block; max-width: 80%;">${escapeHtml(message)}</span>`;
    chatMessages.appendChild(userMsgDiv);
    chatInput.value = '';
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // 显示加载动画
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'chatLoading';
    loadingDiv.style.cssText = 'text-align: left; margin: 8px 0; color: #002a71ff;';
    loadingDiv.innerHTML = ' 正在思考...';
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                message: message,
                product_name: currentProduct || null
            })
        });
        const data = await response.json();
        
        // 移除加载动画
        loadingDiv.remove();
        
        if (data.success) {
            const aiMsgDiv = document.createElement('div');
            aiMsgDiv.style.cssText = 'text-align: left; margin: 8px 0;';
            aiMsgDiv.innerHTML = `<span style="background: rgba(255,255,255,0.2); padding: 8px 14px; border-radius: 18px; display: inline-block; max-width: 80%;">${escapeHtml(data.reply)}</span>`;
            chatMessages.appendChild(aiMsgDiv);
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        loadingDiv.remove();
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = 'text-align: left; margin: 8px 0; color: #ff9999;';
        errorDiv.innerHTML = '⚠️ 请求失败，请稍后再试';
        chatMessages.appendChild(errorDiv);
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// 原生的 escapeHtml 函数（防止 XSS 攻击）
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

