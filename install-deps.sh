#!/bin/bash

# 解决 Android/Termux 环境下的 npm 权限问题

echo "🔧 解决 npm 权限问题..."

# 设置 npm 全局目录到用户目录
npm config set prefix ~/.npm-global

# 临时禁用符号链接
npm config set bin-links false

echo "✅ 已配置 npm 使用用户目录并禁用符号链接"

# 尝试安装依赖
echo "📦 现在安装依赖..."
npm install --no-bin-links axios dotenv express @supabase/supabase-js

# 恢复配置
npm config delete bin-links
npm config delete prefix

echo "✅ 安装完成！"
echo "💡 如果需要全局安装包，请使用: ~/.npm-global/bin/npm install -g <package>"