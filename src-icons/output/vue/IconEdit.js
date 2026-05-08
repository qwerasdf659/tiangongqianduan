import { defineComponent, h } from 'vue';

export const IconEdit = defineComponent({
  name: 'IconEdit',
  props: {
    class: {
      type: String,
      default: ''
    }
  },
  setup(props, { attrs }) {
    return () => h(
      'svg',
      {
        viewBox: '0 0 20 20',
        
        class: `tiangong-icons ${props.class}`,
        ...attrs
      },
      [
        h('path', {"d": "M832 128L256 704l-64 192 192-64L960 256c0-70.7-57.3-128-128-128zM256 832l-64 64h128l-64-64zm576-576l-64 64-128-128 64-64c35.3-35.3 92.7-35.3 128 0s35.3 92.7 0 128z", "fillRule": "evenodd"})
      ]
    );
  }
});
