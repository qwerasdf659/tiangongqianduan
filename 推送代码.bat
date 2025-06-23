@echo off
echo ===================================
echo 推送代码到GitHub仓库
echo ===================================
echo.
echo 请按照以下步骤操作:
echo.
echo 1. 使用以下命令推送代码(需要替换YOUR_TOKEN为您的个人访问令牌):
echo    git push https://qwerasdf659:YOUR_TOKEN@github.com/qwerasdf659/tiangonghouduan.git main
echo.
echo 2. 如何获取个人访问令牌(PAT):
echo    a. 登录GitHub账户
echo    b. 点击右上角头像 -^> Settings -^> Developer settings -^> Personal access tokens -^> Generate new token
echo    c. 选择"repo"权限
echo    d. 生成并复制令牌
echo.
echo 3. 推送成功后，可以使用以下命令验证:
echo    git status
echo.
echo 注意: 个人访问令牌很重要，请妥善保管，不要分享给他人
echo.
echo 按任意键退出...
pause > nul 