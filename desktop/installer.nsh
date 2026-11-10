; Keep user-downloaded reconstruction data beside the executable across updates
; and uninstall. Files outside this one folder retain NSIS's normal behavior.

!macro customHeader
!ifdef BUILD_UNINSTALLER
Function un.directorMoveAppFiles
  Exch $R0
  Push $R1
  Push $R2
  Push $R3
  FindFirst $R1 $R2 "$INSTDIR$R0\*.*"
  director_move_loop:
    StrCmp $R2 "" director_move_complete
    StrCmp $R2 "." director_move_next
    StrCmp $R2 ".." director_move_next
    ${If} $R0 == ""
    ${AndIf} $R2 == "video-reconstruction"
      Goto director_move_next
    ${EndIf}
    IfFileExists "$INSTDIR$R0\$R2\*.*" director_move_directory director_move_file
    director_move_directory:
      CreateDirectory "$PLUGINSDIR\old-install$R0\$R2"
      Push "$R0\$R2"
      Call un.directorMoveAppFiles
      Pop $R3
      StrCmp $R3 0 director_move_next director_move_done
    director_move_file:
      ClearErrors
      Rename "$INSTDIR$R0\$R2" "$PLUGINSDIR\old-install$R0\$R2"
      ; The running uninstaller may be locked; allow NSIS to remove it later.
      StrCmp "$R0\$R2" "${UNINSTALL_FILENAME}" 0 +2
      ClearErrors
      IfErrors 0 director_move_next
      StrCpy $R3 "$INSTDIR$R0\$R2"
      Goto director_move_done
    director_move_next:
      FindNext $R1 $R2
      Goto director_move_loop
    director_move_complete:
      StrCpy $R3 0
    director_move_done:
      FindClose $R1
      StrCpy $R0 $R3
      Pop $R3
      Pop $R2
      Pop $R1
      Exch $R0
FunctionEnd
!endif
!macroend

!macro customRemoveFiles
  ${If} ${isUpdated}
    CreateDirectory "$PLUGINSDIR\old-install"
    Push ""
    Call un.directorMoveAppFiles
    Pop $R0
    ${If} $R0 != 0
      DetailPrint "File is busy, aborting: $R0"
      Push ""
      Call un.restoreFiles
      Pop $R0
      Abort "Application files are in use. Close DirectorDesk and try again."
    ${EndIf}
  ${EndIf}
  SetOutPath $TEMP
  FindFirst $R1 $R2 "$INSTDIR\*.*"
  director_remove_loop:
    StrCmp $R2 "" director_remove_done
    StrCmp $R2 "." director_remove_next
    StrCmp $R2 ".." director_remove_next
    StrCmp $R2 "video-reconstruction" director_remove_next
    IfFileExists "$INSTDIR\$R2\*.*" director_remove_directory director_remove_file
    director_remove_directory:
      RMDir /r "$INSTDIR\$R2"
      Goto director_remove_next
    director_remove_file:
      Delete "$INSTDIR\$R2"
    director_remove_next:
      FindNext $R1 $R2
      Goto director_remove_loop
    director_remove_done:
      FindClose $R1
  ; Succeeds only if there is no retained data folder.
  RMDir "$INSTDIR"
!macroend
