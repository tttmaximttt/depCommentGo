package jiraSdk

import (
  "fmt"
  "path"
  "os/exec"
  "strings"
  "log"
  "bytes"
)

// WIP
// TODO separate logic, move text parsing somewhere

const (
  managerKey = "ManagerService"
  wsKey = "WebSocketConnectionService"
  converterKey = "ConverterService"
  restKey = "RestAPIService"
  ahsKey = "ActivityHistoryService"
  nativeKey = "NativeEditService"
  header = "h1. >>>>>>>>>>>>>>>>>>>> DEPLOYMENT COMMENT <<<<<<<<<<<<<<<<<<<\n"
  footer = "h1. >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<<<<<"
  rowTemplate = "h3. %s %s\n"
  allowToDeploy = "(/)"
  dontDeploy = "(x)"
)

func getGitChangedFiles(resultChan chan []string) chan []string {
  cmd := exec.Command("git", "status", "-s")
  cmd.Stdin = strings.NewReader("some input")
  var out bytes.Buffer
  cmd.Stdout = &out
  err := cmd.Run()
  if err != nil {
    log.Fatal(err)
  }

  commandResult := strings.Split(out.String(), "\n")

  for index, filePath := range commandResult {
    filePath = strings.Replace(filePath, "A ", "", 2)
    filePath = strings.Replace(filePath, "AM ", "", 2)
    filePath = strings.Trim(filePath, " ")

    if len(filePath) > 0 {
      commandResult[index] = filePath
    }
  }

  resultChan <- commandResult
  return resultChan
}

func getServiceNameFromPath(filePaths chan []string, serviceNames chan map[string]string) {
  filePathsArr := <- filePaths
  defer close(filePaths)
  defer close(serviceNames)
  resultMap := map[string]string{}
  for _, filePath := range filePathsArr {
    dirs := path.Dir(filePath)
    dirsArr := strings.Split(dirs, "/")

    if len(dirsArr) > 1 {
      resultMap[dirsArr[1]] = dirsArr[1]
    }
  }

  serviceNames <- resultMap
}

func tmplFn(stringTmpl, markStr, key string) string {
  result := fmt.Sprintf(stringTmpl, key, allowToDeploy)
  if markStr != "" {
    result = fmt.Sprintf(stringTmpl, key, markStr)
  }

  return result
}

type SDK interface {
  GetAllComments(issueIdOrKey string) ([]byte, error)
  GetComment(issueIdOrKey, commentId string) (bool, error)
  CreateComment(issueIdOrKey string) (bool, error)
}

var servicesMap = map[string]string{
  ahsKey: ahsKey,
  converterKey: converterKey,
  managerKey: managerKey,
  nativeKey: nativeKey,
  restKey: restKey,
  wsKey: wsKey,
}

type CommentsSDK struct {}

func (sdk *CommentsSDK) CreateComment(issueIdOrKey string) (bool, error) {
  changeFiles := make(chan []string, 1)
  serviceNames := make(chan map[string]string, 1)

  go getGitChangedFiles(changeFiles)
  go getServiceNameFromPath(changeFiles, serviceNames)

  serviceNamesMap := <- serviceNames

  comment := header
  for _, serviceName := range serviceNamesMap {
    if _, ok := servicesMap[serviceName]; ok {
      comment += tmplFn(rowTemplate, allowToDeploy, serviceName)
    }
  }
  comment += footer

  return true, nil
}