# myworkspaces: 2-line prompt (cwd + git branch / '# ')
# /etc/profile から source される。PROMPT_COMMAND 経由で毎プロンプトに PS1 を
# 再設定することで、~/.bashrc が PS1 を上書きした後でも勝つ。
if [ -r /usr/lib/git-core/git-sh-prompt ]; then
  . /usr/lib/git-core/git-sh-prompt
fi
__myworkspaces_prompt() {
  PS1='\[\033[96m\]\w $(__git_ps1 "(%s)")'$'\n\[\033[00m\]# '
}
PROMPT_COMMAND="${PROMPT_COMMAND:+${PROMPT_COMMAND};}__myworkspaces_prompt"
