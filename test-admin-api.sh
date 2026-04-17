#!/bin/bash

# 测试管理后台API的脚本

echo "测试管理后台API..."

# 测试统计API
echo "1. 测试统计API..."
curl -s "http://localhost:3000/api/admin/stats" \
  -H "Authorization: Bearer admin_token" \
  | jq '.' || echo "请求失败"

echo -e "\n2. 测试用户列表API..."
curl -s "http://localhost:3000/api/admin/users?page=1&pageSize=10" \
  -H "Authorization: Bearer admin_token" \
  | jq '.' || echo "请求失败"

echo -e "\n3. 测试订单列表API..."
curl -s "http://localhost:3000/api/admin/orders?page=1&pageSize=10" \
  -H "Authorization: Bearer admin_token" \
  | jq '.' || echo "请求失败"

echo -e "\n4. 测试用户详情API..."
curl -s "http://localhost:3000/api/admin/user-details?userId=test-user-id" \
  -H "Authorization: Bearer admin_token" \
  | jq '.' || echo "请求失败"

echo -e "\n测试完成！"