; Custom NSIS hooks, included by electron-builder (`nsis.include` in electron-builder.cjs).
;
; ── An installer run BY HAND never replaces a NEWER installed version ─────────────────────
; An old setup .exe left in Downloads, double-clicked weeks later, used to install over the
; current version without a word: the user went back to a build missing later fixes and
; nothing said so. Measured in production (26/11/2026, 0.17.7 installed over 0.17.10).
;
; What still goes through:
; - every run started BY THE UPDATER: electron-updater always passes `--updated`
;   (NsisUpdater), including a deliberate downgrade (`updates:pin` / `updates:switch`,
;   the admin rollback): that path has its own gate in main (`src/main/updates/channel.ts`);
; - the same or a newer version (a repair reinstall, a normal manual upgrade);
; - a first install (nothing in the registry);
; - `--allow-downgrade`, for support: going back on purpose stays possible.
;
; The installed version is the one the previous installer wrote (`DisplayVersion` under the
; per-user uninstall key, `include/installer.nsh` of app-builder-lib). Only the numeric
; `x.y.z` is compared: a prerelease suffix is never published as an installer.
; Pinned by `scripts/installerNsh.test.ts`.

!include "WordFunc.nsh"

!macro customInit
  ${IfNot} ${isUpdated}
    ; Same parameter test electron-builder generates for its own flags (`--updated`).
    ${StdUtils.TestParameter} $R8 "allow-downgrade"
    ${If} $R8 != "true"
      ReadRegStr $R0 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
      ${If} $R0 != ""
        ${WordFind} "$R0" "-" "+1{" $R1
        ${WordFind} "${VERSION}" "-" "+1{" $R2
        ${VersionCompare} "$R1" "$R2" $R3
        ; 1 = the installed version is NEWER than this installer's
        ${If} $R3 == "1"
          ${If} $LANGUAGE == 1036
            MessageBox MB_OK|MB_ICONINFORMATION "${PRODUCT_NAME} $R0 est déjà installé, une version plus récente que ce programme d'installation (${VERSION}).$\r$\n$\r$\nRien n'a été modifié. Ouvrez ${PRODUCT_NAME} depuis le menu Démarrer : il se met à jour tout seul." /SD IDOK
          ${Else}
            MessageBox MB_OK|MB_ICONINFORMATION "${PRODUCT_NAME} $R0 is already installed, a newer version than this installer (${VERSION}).$\r$\n$\r$\nNothing was changed. Open ${PRODUCT_NAME} from the Start menu: it updates itself." /SD IDOK
          ${EndIf}
          SetErrorLevel 2
          Quit
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
