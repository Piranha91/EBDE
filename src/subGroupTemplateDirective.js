ngapp.directive('displaySubgroups', function() {
    return {
        restrict: 'E',
        scope: {
            data: '='
        },
        templateUrl: `${moduleUrl}/partials/subGroupTemplateDirective.html`,
        controller: 'subgroupController'
    };
});

ngapp.controller('subgroupController', function($scope)
{
    $scope.addSubgroup = function() {
        $scope.data.push({
            id: 'defaultId',
            allowedRaces: [],
            disalledRaces: [],
            allowedAttributes: [],
            disallowedAttributes: [],
            name: 'Default Name',
            requireSubgroups: [],
            excludeSubgroups: [],
            paths: [],
            subgroups: []
        });
    }
})

