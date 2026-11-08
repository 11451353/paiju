Option Explicit

' Launcher: start the local game server if it is not running, then open the game window.
' Kept ASCII-only on purpose: VBScript reads files as ANSI.

Dim fso, sh, launcherDir, root, bunPath, servePath, port, url
Dim chromePath, edgePath, tries

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

launcherDir = fso.GetParentFolderName(WScript.ScriptFullName)
root = fso.GetParentFolderName(launcherDir)
servePath = launcherDir & "\serve.ts"

port = 4173
url = "http://127.0.0.1:" & port & "/"

bunPath = sh.ExpandEnvironmentStrings("%USERPROFILE%") & "\.cherrystudio\bin\bun.exe"

If Not fso.FileExists(bunPath) Then
  MsgBox "Runtime not found:" & vbCrLf & bunPath, 16, "Game Launcher"
  WScript.Quit 1
End If

If Not fso.FileExists(servePath) Then
  MsgBox "Server script not found:" & vbCrLf & servePath, 16, "Game Launcher"
  WScript.Quit 1
End If

If Not ServerUp(url) Then
  sh.Run """" & bunPath & """ """ & servePath & """", 0, False

  tries = 0
  Do While tries < 60
    WScript.Sleep 250
    If ServerUp(url) Then Exit Do
    tries = tries + 1
  Loop

  If Not ServerUp(url) Then
    MsgBox "Server failed to start on port " & port, 16, "Game Launcher"
    WScript.Quit 1
  End If
End If

chromePath = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Google\Chrome\Application\chrome.exe"
edgePath = sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Microsoft\Edge\Application\msedge.exe"

If fso.FileExists(chromePath) Then
  sh.Run """" & chromePath & """ --app=" & url, 1, False
ElseIf fso.FileExists(edgePath) Then
  sh.Run """" & edgePath & """ --app=" & url, 1, False
Else
  sh.Run url, 1, False
End If

Function ServerUp(target)
  Dim http
  ServerUp = False

  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  If Err.Number <> 0 Then
    Err.Clear
    On Error GoTo 0
    Exit Function
  End If

  http.setTimeouts 200, 200, 200, 700
  http.open "GET", target, False
  http.send

  If Err.Number = 0 Then
    If http.Status = 200 Then ServerUp = True
  End If

  Err.Clear
  On Error GoTo 0
End Function
